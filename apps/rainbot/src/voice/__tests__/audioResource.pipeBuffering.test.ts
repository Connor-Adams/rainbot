import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { Readable } from 'stream';
import type { Track } from '@rainbot/protocol';

// Drives a REAL child process through the REAL tinyspawn/youtube-dl-exec, like
// audioResource.streamClosed.test.ts: the bug pinned here only exists because
// tinyspawn reads stdout from the moment it spawns, which a hand-built fake
// stdout does not reproduce.
jest.mock('@discordjs/voice', () => ({
  ...jest.requireActual('@discordjs/voice'),
  createAudioResource: jest.fn(),
}));

jest.mock('play-dl', () => ({
  __esModule: true,
  default: { stream: jest.fn(), validate: jest.fn() },
}));

jest.mock('youtube-dl-exec', () => {
  const actual = jest.requireActual('youtube-dl-exec');
  const mockCapturedSubprocesses: Array<Promise<unknown>> = [];
  return {
    __esModule: true,
    default: {
      ...actual,
      create: (binaryPath: string) => {
        const real = actual.create(binaryPath) as {
          exec: (...args: unknown[]) => Promise<unknown>;
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
) as { __mockCapturedSubprocesses: Array<Promise<unknown>> };

const FAKE_YTDLP_PATH = path.join(
  os.tmpdir(),
  `rainbot-fake-ytdlp-buffering-${process.pid}-${Date.now()}.js`
);

// The mode file picks the behaviour. Not an env var: Jest sandboxes
// process.env, so a value set in a test never reaches the child.
const MODE_PATH = `${FAKE_YTDLP_PATH}.mode`;
//   slow:   the file header straight away, the rest after the 4s start window
//   fast:   the whole file straight away, then a clean exit inside the window
//   stream: bytes forever, until killed
const FAKE_YTDLP_SCRIPT = `#!/usr/bin/env node
'use strict';
const mode = require('fs').readFileSync(${JSON.stringify(MODE_PATH)}, 'utf8');
if (mode === 'slow') {
  process.stdout.write('HEADER');
  setTimeout(() => process.stdout.write('BODY'), 4300);
} else if (mode === 'fast') {
  process.stdout.write('WHOLE-TRACK');
} else {
  setInterval(() => process.stdout.write('more-bytes'), 30);
}
`;

process.env['YTDLP_PATH'] = FAKE_YTDLP_PATH;

const { createTrackResourceForAny } =
  require('../audioResource') as typeof import('../audioResource');

const voice = jest.requireMock('@discordjs/voice') as { createAudioResource: jest.Mock };
const playDl = (jest.requireMock('play-dl') as { default: { stream: jest.Mock } }).default;

beforeAll(() => fs.writeFileSync(FAKE_YTDLP_PATH, FAKE_YTDLP_SCRIPT, { mode: 0o755 }));

afterAll(() => {
  fs.rmSync(FAKE_YTDLP_PATH, { force: true });
  fs.rmSync(MODE_PATH, { force: true });
  delete process.env['YTDLP_PATH'];
});

beforeEach(() => {
  capturedSubprocesses.length = 0;
  voice.createAudioResource.mockReset().mockReturnValue({ fakeResource: true });
  playDl.stream.mockReset();
});

const track: Track = {
  title: 'Buffering Test',
  url: 'https://www.youtube.com/watch?v=aaaaaaaaaaa',
  sourceType: 'youtube',
};

async function readAll(stream: Readable): Promise<string> {
  let text = '';
  for await (const chunk of stream) text += chunk.toString();
  return text;
}

function playedStream(): Readable {
  return voice.createAudioResource.mock.calls[0][0] as Readable;
}

describe('createTrackResourcePipe buffering (real subprocess)', () => {
  it('keeps the bytes yt-dlp writes before the player attaches', async () => {
    fs.writeFileSync(MODE_PATH, 'slow');

    await createTrackResourceForAny(track);

    expect(await readAll(playedStream())).toBe('HEADERBODY');
  }, 15_000);

  it('plays a track that downloads in full inside the start window', async () => {
    fs.writeFileSync(MODE_PATH, 'fast');

    await createTrackResourceForAny(track);

    expect(playDl.stream).not.toHaveBeenCalled();
    expect(await readAll(playedStream())).toBe('WHOLE-TRACK');
  }, 15_000);

  it('ends yt-dlp when the player drops the stream (skip/stop)', async () => {
    fs.writeFileSync(MODE_PATH, 'stream');
    await createTrackResourceForAny(track);

    playedStream().destroy();

    await expect(capturedSubprocesses[0]).rejects.toMatchObject({ signalCode: 'SIGTERM' });
  }, 15_000);
});
