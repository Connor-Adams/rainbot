/* eslint-disable @typescript-eslint/no-explicit-any */
import { EventEmitter } from 'events';

// Hoisted so it survives any module resets - a factory-local jest.fn() would
// be rebuilt empty.
const mockSpawn = jest.fn();

jest.mock('child_process', () => ({
  spawn: mockSpawn,
}));

/** A stand-in ffmpeg that emits `output` on stdout/`stderrText` on stderr and exits with `code`. */
function fakeFfmpeg(output: Buffer, code = 0, stderrText = '') {
  const child = new EventEmitter() as any;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.stdin = { write: jest.fn(), end: jest.fn() };

  process.nextTick(() => {
    if (code === 0 && output.length > 0) child.stdout.emit('data', output);
    if (stderrText) child.stderr.emit('data', Buffer.from(stderrText, 'utf8'));
    child.emit('close', code);
  });

  return child;
}

import { toWavBuffer, MAX_DECODE_SECONDS, MAX_DECODE_STDOUT_BYTES } from '../audioTranscode';

describe('toWavBuffer', () => {
  beforeEach(() => {
    mockSpawn.mockReset();
  });

  it('spawns ffmpeg to decode to 16kHz mono 16-bit PCM wav', async () => {
    const wavOut = Buffer.from('RIFF....WAVEfmt ');
    mockSpawn.mockImplementation(() => fakeFfmpeg(wavOut));

    const input = Buffer.from('fake-ogg-bytes');
    const result = await toWavBuffer(input);

    expect(result).toEqual(wavOut);
    expect(mockSpawn).toHaveBeenCalledWith('ffmpeg', [
      '-hide_banner',
      '-loglevel',
      'error',
      '-i',
      'pipe:0',
      '-t',
      String(MAX_DECODE_SECONDS),
      '-ar',
      '16000',
      '-ac',
      '1',
      '-c:a',
      'pcm_s16le',
      '-f',
      'wav',
      'pipe:1',
    ]);

    const child = mockSpawn.mock.results[0].value;
    expect(child.stdin.write).toHaveBeenCalledWith(input);
    expect(child.stdin.end).toHaveBeenCalled();
  });

  it('rejects with the stderr text when ffmpeg exits non-zero', async () => {
    mockSpawn.mockImplementation(() => fakeFfmpeg(Buffer.alloc(0), 1, 'ffmpeg: invalid data'));

    await expect(toWavBuffer(Buffer.from('bad'))).rejects.toThrow('ffmpeg: invalid data');
  });

  it('rejects with a generic message when ffmpeg exits non-zero with no stderr', async () => {
    mockSpawn.mockImplementation(() => fakeFfmpeg(Buffer.alloc(0), 1));

    await expect(toWavBuffer(Buffer.from('bad'))).rejects.toThrow('ffmpeg exited with code 1');
  });

  it('rejects when the ffmpeg process itself errors (e.g. binary not found)', async () => {
    const child = new EventEmitter() as any;
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.stdin = { write: jest.fn(), end: jest.fn() };
    mockSpawn.mockImplementation(() => {
      process.nextTick(() => child.emit('error', new Error('spawn ffmpeg ENOENT')));
      return child;
    });

    await expect(toWavBuffer(Buffer.from('bad'))).rejects.toThrow('spawn ffmpeg ENOENT');
  });

  it('kills ffmpeg and rejects if stdout exceeds the byte ceiling despite the -t cap', async () => {
    const child = new EventEmitter() as any;
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.stdin = { write: jest.fn(), end: jest.fn() };
    child.kill = jest.fn();

    mockSpawn.mockImplementation(() => {
      process.nextTick(() => {
        // Two chunks whose combined size crosses the ceiling - simulates a
        // duration cap that, for whatever reason, did not stop the stream.
        const half = Buffer.alloc(Math.ceil(MAX_DECODE_STDOUT_BYTES / 2) + 1);
        child.stdout.emit('data', half);
        child.stdout.emit('data', half);
        // A real SIGKILL still delivers a 'close' event; the promise must
        // reject from the size check rather than resolving with partial data.
        child.emit('close', null);
      });
      return child;
    });

    await expect(toWavBuffer(Buffer.from('bad'))).rejects.toThrow(/exceeded/);
    expect(child.kill).toHaveBeenCalledWith('SIGKILL');
  });
});
