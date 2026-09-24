import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { metrics, type Attributes } from '@opentelemetry/api';
import {
  MeterProvider,
  InMemoryMetricExporter,
  PeriodicExportingMetricReader,
  AggregationTemporality,
} from '@opentelemetry/sdk-metrics';
import { RainbotAttr } from '@rainbot/observability/node';
import type { Track } from '@rainbot/protocol';

// This file deliberately drives a REAL yt-dlp-shaped child process through
// the REAL tinyspawn/youtube-dl-exec rejection path, instead of hand-building
// a mock rejection object like audioResource.pipeTelemetry.test.ts does. A
// prior verification review found a real bug this way — every /skip and
// /stop was counted as a yt-dlp resolve failure — that hand-built mocks
// didn't reproduce, because a signal-killed real child process has
// `exitCode: null` and a `signalCode`, a shape that's easy to get subtly
// wrong by hand (tinyspawn's `createChildProcessError` copies these off the
// real ChildProcess). `youtube-dl-exec`/tinyspawn are NOT mocked below: only
// wrapped just enough to capture a handle to the real subprocess so the test
// can trigger its two outcomes (signal-killed vs. a clean non-zero exit)
// deterministically, rather than racing a real OS pipe/EPIPE — the
// classification and counting logic under test only cares about the
// resulting rejection shape (signalCode vs. exitCode), which is identical
// either way.
jest.mock('@discordjs/voice', () => {
  const actual = jest.requireActual('@discordjs/voice');
  return {
    ...actual,
    createAudioResource: jest.fn(),
  };
});

jest.mock('play-dl', () => ({
  __esModule: true,
  default: {
    stream: jest.fn(),
    validate: jest.fn(),
  },
}));

jest.mock('youtube-dl-exec', () => {
  const actual = jest.requireActual('youtube-dl-exec');
  const mockCapturedSubprocesses: Array<Promise<unknown> & { kill: (signal?: string) => void }> =
    [];

  return {
    __esModule: true,
    default: {
      ...actual,
      // Only `.create()` is used by audioResource.ts. The returned object's
      // `.exec()` delegates to the real implementation (real spawn, real
      // tinyspawn) and additionally records the resulting real subprocess so
      // the test can reach in and signal it directly.
      create: (binaryPath: string) => {
        const real = actual.create(binaryPath) as {
          exec: (...args: unknown[]) => Promise<unknown> & { kill: (signal?: string) => void };
        };
        return {
          exec: (...execArgs: unknown[]) => {
            const subprocess = real.exec(...execArgs);
            mockCapturedSubprocesses.push(subprocess);
            return subprocess;
          },
        };
      },
    },
    __mockCapturedSubprocesses: mockCapturedSubprocesses,
  };
});

const { __mockCapturedSubprocesses: capturedSubprocesses } = jest.requireMock(
  'youtube-dl-exec'
) as {
  __mockCapturedSubprocesses: Array<Promise<unknown> & { kill: (signal?: string) => void }>;
};

// `audioResource.ts` reads YTDLP_PATH at module-import time
// (`youtubedlPkg.create(process.env['YTDLP_PATH'] || 'yt-dlp')`), so it must
// be set before the module is first required — hence the plain `require()`
// below instead of a static `import`, which ts-jest would otherwise hoist
// above this assignment (see packages/observability's sdk.test.ts for the
// same pattern).
const FAKE_YTDLP_PATH = path.join(
  os.tmpdir(),
  `rainbot-fake-ytdlp-${process.pid}-${Date.now()}.js`
);

// Stays alive writing bytes (so the pipe survives the 4s start window) until
// killed. SIGTERM (Node's default handling — no listener here) produces a
// signal-killed exit: exitCode null, signalCode set — the "consumer went
// away" shape from @discordjs/voice destroying the play stream on /skip or
// /stop. SIGUSR1 is caught to simulate a genuine yt-dlp failure instead: a
// clean non-zero exit with no signal involved.
const FAKE_YTDLP_SCRIPT = `#!/usr/bin/env node
'use strict';
process.stdout.write('first-byte');
const timer = setInterval(() => {
  try {
    process.stdout.write('more-bytes');
  } catch (e) {
    // ignored — the process is being torn down either way
  }
}, 30);
process.on('exit', () => clearInterval(timer));
process.on('SIGUSR1', () => {
  process.stderr.write('yt-dlp: ERROR: simulated real failure\\n');
  process.exit(7);
});
`;

process.env['YTDLP_PATH'] = FAKE_YTDLP_PATH;

const { createTrackResourceForAny } =
  require('../audioResource') as typeof import('../audioResource');

let metricsExporter: InMemoryMetricExporter;
let metricsReader: PeriodicExportingMetricReader;

beforeAll(() => {
  fs.writeFileSync(FAKE_YTDLP_PATH, FAKE_YTDLP_SCRIPT, { mode: 0o755 });

  metricsExporter = new InMemoryMetricExporter(AggregationTemporality.DELTA);
  metricsReader = new PeriodicExportingMetricReader({
    exporter: metricsExporter,
    exportIntervalMillis: 60_000,
  });
  metrics.setGlobalMeterProvider(new MeterProvider({ readers: [metricsReader] }));
});

afterAll(async () => {
  await metricsReader.shutdown();
  fs.rmSync(FAKE_YTDLP_PATH, { force: true });
  delete process.env['YTDLP_PATH'];
});

beforeEach(() => {
  metricsExporter.reset();
  capturedSubprocesses.length = 0;
  const voice = jest.requireMock('@discordjs/voice') as { createAudioResource: jest.Mock };
  voice.createAudioResource.mockReset().mockReturnValue({ fakeResource: true });
});

function youtubeTrack(): Track {
  return {
    title: 'Real Subprocess Test',
    url: 'https://www.youtube.com/watch?v=aaaaaaaaaaa',
    sourceType: 'youtube',
  };
}

function getCounterPoints(name: string) {
  return metricsExporter
    .getMetrics()
    .flatMap((m) => m.scopeMetrics)
    .flatMap((s) => s.metrics)
    .filter((m) => m.descriptor.name === name)
    .flatMap((m) => m.dataPoints as Array<{ value: number; attributes: Attributes }>);
}

function pipeFailurePoints() {
  return getCounterPoints('rainbot.track.resolve.failures').filter(
    (p) => p.attributes[RainbotAttr.extractionPath] === 'pipe'
  );
}

describe('createTrackResourcePipe post-window classification (real subprocess)', () => {
  it('records no failure when the child is killed by signal (skip/stop closing the pipe)', async () => {
    // Resolves once the real process survives the 4s pipe-start window.
    const resource = await createTrackResourceForAny(youtubeTrack());
    expect(resource).toEqual({ fakeResource: true });

    await metricsReader.forceFlush();
    expect(pipeFailurePoints()).toHaveLength(0);

    expect(capturedSubprocesses).toHaveLength(1);
    const subprocess = capturedSubprocesses[0]!;
    subprocess.kill('SIGTERM');
    // Wait for the REAL rejection to settle before asserting — this is the
    // exact promise audioResource.ts's own post-window `.catch()` is
    // attached to, registered before this one, so by the time our handler
    // runs its (synchronous) recordTrackResolveFailure call has already run.
    await subprocess.catch(() => undefined);
    await metricsReader.forceFlush();

    expect(pipeFailurePoints()).toHaveLength(0);
  }, 15000);

  it('still records a failure for a genuine post-window yt-dlp exit (non-zero, no signal)', async () => {
    const resource = await createTrackResourceForAny(youtubeTrack());
    expect(resource).toEqual({ fakeResource: true });

    expect(capturedSubprocesses).toHaveLength(1);
    const subprocess = capturedSubprocesses[0]!;
    const pid = (subprocess as unknown as { pid?: number }).pid;
    expect(pid).toBeDefined();
    process.kill(pid!, 'SIGUSR1');
    await subprocess.catch(() => undefined);
    await metricsReader.forceFlush();

    const failures = pipeFailurePoints();
    expect(failures).toHaveLength(1);
    expect(failures[0]!.value).toBe(1);
    expect(failures[0]!.attributes[RainbotAttr.outcome]).toBe('exit_7');
  }, 15000);
});
