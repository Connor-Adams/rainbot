import { EventEmitter } from 'events';
import {
  MeterProvider,
  InMemoryMetricExporter,
  PeriodicExportingMetricReader,
  AggregationTemporality,
} from '@opentelemetry/sdk-metrics';
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { metrics, trace, type Attributes } from '@opentelemetry/api';
import { RainbotAttr } from '@rainbot/observability/node';
import { createAudioResource, StreamType } from '@discordjs/voice';
import play from 'play-dl';
import type { Track } from '@rainbot/protocol';
import { createTrackResourceForAny } from '../audioResource';

// F2/F3/F12: the yt-dlp pipe path is the primary path for most YouTube
// playback (createTrackResourceForAny tries it first). These tests exercise
// the real subprocess-race/telemetry interaction that the mocked-immediate-
// rejection tests in audioResource.telemetry.test.ts don't reach, because
// there the pipe is made to fail before the 4s window ever matters.
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
  const mockCall = jest.fn();
  const mockExec = jest.fn();
  const fn = (...args: unknown[]) => mockCall(...args);
  (fn as unknown as { exec: (...args: unknown[]) => unknown }).exec = (...args: unknown[]) =>
    mockExec(...args);
  return {
    __esModule: true,
    default: { create: jest.fn(() => fn) },
    __mockCall: mockCall,
    __mockExec: mockExec,
  };
});

const { __mockCall: mockYtdlpCall, __mockExec: mockYtdlpExec } = jest.requireMock(
  'youtube-dl-exec'
) as { __mockCall: jest.Mock; __mockExec: jest.Mock };

const mockCreateAudioResource = createAudioResource as jest.Mock;
const mockPlayStream = play.stream as jest.Mock;
const mockPlayValidate = play.validate as jest.Mock;

const spanExporter = new InMemorySpanExporter();
let metricsExporter: InMemoryMetricExporter;
let metricsReader: PeriodicExportingMetricReader;

beforeAll(() => {
  trace.setGlobalTracerProvider(
    new BasicTracerProvider({ spanProcessors: [new SimpleSpanProcessor(spanExporter)] })
  );

  // DELTA temporality + exporter.reset() per test gives us just this test's
  // recordings, not a running cumulative total — important since the
  // histogram/counter instruments (packages/observability/src/node/metrics.ts)
  // bind permanently to whichever MeterProvider is global on first use, so a
  // fresh provider per test would silently stop being read from.
  metricsExporter = new InMemoryMetricExporter(AggregationTemporality.DELTA);
  metricsReader = new PeriodicExportingMetricReader({
    exporter: metricsExporter,
    exportIntervalMillis: 60_000,
  });
  metrics.setGlobalMeterProvider(new MeterProvider({ readers: [metricsReader] }));
});

afterAll(async () => {
  await metricsReader.shutdown();
});

beforeEach(() => {
  spanExporter.reset();
  metricsExporter.reset();
  mockCreateAudioResource.mockReset().mockReturnValue({ fakeResource: true });
  mockPlayStream.mockReset();
  mockPlayValidate.mockReset();
  mockYtdlpCall.mockReset();
  mockYtdlpExec.mockReset();
});

function youtubeTrack(): Track {
  return {
    title: 'Test Song',
    url: 'https://www.youtube.com/watch?v=aaaaaaaaaaa',
    sourceType: 'youtube',
  };
}

/**
 * A fake `youtube-dl-exec` `.exec()` result: a Promise (settles on process
 * exit) with `.stdout` / `.stderr` EventEmitters attached, matching the
 * tinyspawn shape the real subprocess has (see node_modules/tinyspawn).
 */
function createFakeSubprocess() {
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();
  let settleReject!: (reason: unknown) => void;
  const promise = new Promise((_resolve, reject) => {
    settleReject = reject;
  });
  const subprocess = Object.assign(promise, { stdout, stderr }) as Promise<unknown> & {
    stdout: EventEmitter;
    stderr: EventEmitter;
  };
  return {
    subprocess,
    exitWithError: (err: unknown) => settleReject(err),
    emitStdoutData: (chunk = 'x') => stdout.emit('data', Buffer.from(chunk)),
  };
}

function findAudioResourceCreateSpan() {
  return spanExporter.getFinishedSpans().find((s) => s.name === 'audio.resource.create');
}

function getHistogramPoints(name: string) {
  return metricsExporter
    .getMetrics()
    .flatMap((m) => m.scopeMetrics)
    .flatMap((s) => s.metrics)
    .filter((m) => m.descriptor.name === name)
    .flatMap(
      (m) =>
        m.dataPoints as Array<{
          value: { sum: number; count: number };
          attributes: Attributes;
        }>
    );
}

function getCounterPoints(name: string) {
  return metricsExporter
    .getMetrics()
    .flatMap((m) => m.scopeMetrics)
    .flatMap((s) => s.metrics)
    .filter((m) => m.descriptor.name === name)
    .flatMap((m) => m.dataPoints as Array<{ value: number; attributes: Attributes }>);
}

describe('createTrackResourcePipe telemetry (F2)', () => {
  it('records a materially different duration for a fast first byte than a slow one, not a constant', async () => {
    jest.useFakeTimers();
    try {
      // Fast: first byte arrives after 50ms, process stays alive past the 4s window.
      const fast = createFakeSubprocess();
      mockYtdlpExec.mockReturnValueOnce(fast.subprocess);
      const fastPromise = createTrackResourceForAny(youtubeTrack());
      await jest.advanceTimersByTimeAsync(50);
      fast.emitStdoutData();
      await jest.advanceTimersByTimeAsync(3950);
      await expect(fastPromise).resolves.toEqual({ fakeResource: true });
      // PeriodicExportingMetricReader.collect() races an internal timeout
      // that's scheduled through the timer functions active when it's
      // called. Under fake timers that race never gets an advance and
      // forceFlush hangs forever, so drop to real timers just for the flush.
      jest.useRealTimers();
      await metricsReader.forceFlush();
      jest.useFakeTimers();
      const fastPoints = getHistogramPoints('rainbot.track.resolve.duration').filter(
        (p) => p.attributes[RainbotAttr.extractionPath] === 'pipe'
      );
      expect(fastPoints).toHaveLength(1);
      const fastDuration = fastPoints[0]!.value.sum;
      metricsExporter.reset();

      // Slow: first byte arrives after 3000ms, process also stays alive past 4s.
      const slow = createFakeSubprocess();
      mockYtdlpExec.mockReturnValueOnce(slow.subprocess);
      const slowPromise = createTrackResourceForAny(youtubeTrack());
      await jest.advanceTimersByTimeAsync(3000);
      slow.emitStdoutData();
      await jest.advanceTimersByTimeAsync(1000);
      await expect(slowPromise).resolves.toEqual({ fakeResource: true });
      jest.useRealTimers();
      await metricsReader.forceFlush();
      jest.useFakeTimers();
      const slowPoints = getHistogramPoints('rainbot.track.resolve.duration').filter(
        (p) => p.attributes[RainbotAttr.extractionPath] === 'pipe'
      );
      expect(slowPoints).toHaveLength(1);
      const slowDuration = slowPoints[0]!.value.sum;

      expect(fastDuration).toBeGreaterThanOrEqual(40);
      expect(fastDuration).toBeLessThan(500);
      expect(slowDuration).toBeGreaterThanOrEqual(2900);
      expect(slowDuration).toBeLessThan(3500);
      expect(slowDuration - fastDuration).toBeGreaterThan(1000);
    } finally {
      jest.useRealTimers();
    }
  });

  it('records a failure when the process dies after the race already resolved to "keep using it"', async () => {
    jest.useFakeTimers();
    try {
      const proc = createFakeSubprocess();
      mockYtdlpExec.mockReturnValueOnce(proc.subprocess);

      const resultPromise = createTrackResourceForAny(youtubeTrack());
      await jest.advanceTimersByTimeAsync(100);
      proc.emitStdoutData();
      await jest.advanceTimersByTimeAsync(3900);
      await expect(resultPromise).resolves.toEqual({ fakeResource: true });

      // Nothing has failed yet from telemetry's point of view.
      jest.useRealTimers();
      await metricsReader.forceFlush();
      jest.useFakeTimers();
      expect(
        getCounterPoints('rainbot.track.resolve.failures').filter(
          (p) => p.attributes[RainbotAttr.extractionPath] === 'pipe'
        )
      ).toHaveLength(0);

      // The process now dies mid-stream — exactly what yt-dlp rot looks like.
      const boom = Object.assign(new Error('ffmpeg pipe closed'), { exitCode: 1 });
      proc.exitWithError(boom);
      await jest.advanceTimersByTimeAsync(0);
      jest.useRealTimers();
      await metricsReader.forceFlush();

      const failurePoints = getCounterPoints('rainbot.track.resolve.failures').filter(
        (p) => p.attributes[RainbotAttr.extractionPath] === 'pipe'
      );
      expect(failurePoints).toHaveLength(1);
      expect(failurePoints[0]!.value).toBe(1);
      expect(failurePoints[0]!.attributes[RainbotAttr.outcome]).toBe('exit_1');
    } finally {
      jest.useRealTimers();
    }
  });

  it('records no failure when the process is killed by signal after the race already resolved (skip/stop)', async () => {
    jest.useFakeTimers();
    try {
      const proc = createFakeSubprocess();
      mockYtdlpExec.mockReturnValueOnce(proc.subprocess);

      const resultPromise = createTrackResourceForAny(youtubeTrack());
      await jest.advanceTimersByTimeAsync(100);
      proc.emitStdoutData();
      await jest.advanceTimersByTimeAsync(3900);
      await expect(resultPromise).resolves.toEqual({ fakeResource: true });

      jest.useRealTimers();
      await metricsReader.forceFlush();
      jest.useFakeTimers();
      expect(
        getCounterPoints('rainbot.track.resolve.failures').filter(
          (p) => p.attributes[RainbotAttr.extractionPath] === 'pipe'
        )
      ).toHaveLength(0);

      // @discordjs/voice destroying the play stream on /skip or /stop breaks
      // the pipe and kills yt-dlp via a signal: tinyspawn/Node report that as
      // exitCode: null, signalCode: '<SIG>'. That is deliberate shutdown, not
      // yt-dlp rot, and must not increment the failure counter.
      const killed = Object.assign(new Error('killed'), {
        name: 'ChildProcessError',
        exitCode: null,
        signalCode: 'SIGTERM',
      });
      proc.exitWithError(killed);
      await jest.advanceTimersByTimeAsync(0);
      jest.useRealTimers();
      await metricsReader.forceFlush();

      expect(
        getCounterPoints('rainbot.track.resolve.failures').filter(
          (p) => p.attributes[RainbotAttr.extractionPath] === 'pipe'
        )
      ).toHaveLength(0);
    } finally {
      jest.useRealTimers();
    }
  });

  it('classifies an immediate pipe failure by exit code rather than the bare outcome literal', async () => {
    // Fake timers here too: the pipe rejects on the next microtask, well
    // before PIPE_START_TIMEOUT_MS, but that setTimeout is still scheduled as
    // the "loser" of the race — real timers would leave it as a dangling
    // open handle for the rest of the process's life.
    jest.useFakeTimers();
    try {
      const proc = createFakeSubprocess();
      mockYtdlpExec.mockReturnValueOnce(proc.subprocess);
      mockYtdlpCall.mockRejectedValue(new Error('get-url failed'));
      mockPlayStream.mockResolvedValue({ stream: 'fake-stream', type: StreamType.Opus });

      const resultPromise = createTrackResourceForAny(youtubeTrack());
      const boom = Object.assign(new Error('yt-dlp exited'), { exitCode: 2 });
      proc.exitWithError(boom);

      await expect(resultPromise).resolves.toEqual({ fakeResource: true });
      jest.useRealTimers();
      await metricsReader.forceFlush();

      const failurePoints = getCounterPoints('rainbot.track.resolve.failures').filter(
        (p) => p.attributes[RainbotAttr.extractionPath] === 'pipe'
      );
      expect(failurePoints).toHaveLength(1);
      expect(failurePoints[0]!.attributes[RainbotAttr.outcome]).toBe('exit_2');
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('createTrackResourceForAny resolutionPath on the yt-dlp paths (F3)', () => {
  it('spans the pipe success with resolutionPath=yt-dlp-pipe', async () => {
    jest.useFakeTimers();
    try {
      const proc = createFakeSubprocess();
      mockYtdlpExec.mockReturnValueOnce(proc.subprocess);

      const resultPromise = createTrackResourceForAny(youtubeTrack());
      await jest.advanceTimersByTimeAsync(4000);
      await expect(resultPromise).resolves.toEqual({ fakeResource: true });

      const span = findAudioResourceCreateSpan();
      expect(span).toBeDefined();
      expect(span!.attributes[RainbotAttr.resolutionPath]).toBe('yt-dlp-pipe');
    } finally {
      jest.useRealTimers();
    }
  });

  it('spans the async-fetch success with resolutionPath=yt-dlp-async-fetch when the pipe fails fast', async () => {
    jest.useFakeTimers();
    const originalFetch = global.fetch;
    try {
      mockYtdlpExec.mockImplementation(() => Promise.reject(new Error('pipe failed')));
      mockYtdlpCall.mockResolvedValue('https://stream.example.com/audio.opus');
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array([1, 2, 3]));
            controller.close();
          },
        }),
      }) as unknown as typeof fetch;

      const resource = await createTrackResourceForAny(youtubeTrack());
      expect(resource).toEqual({ fakeResource: true });

      const span = findAudioResourceCreateSpan();
      expect(span).toBeDefined();
      expect(span!.attributes[RainbotAttr.resolutionPath]).toBe('yt-dlp-async-fetch');
    } finally {
      global.fetch = originalFetch;
      jest.useRealTimers();
    }
  });
});
