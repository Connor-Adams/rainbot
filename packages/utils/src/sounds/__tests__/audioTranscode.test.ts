/* eslint-disable @typescript-eslint/no-explicit-any */
import { EventEmitter } from 'events';

// Hoisted so it survives any module resets - a factory-local jest.fn() would
// be rebuilt empty.
const mockSpawn = jest.fn();

jest.mock('child_process', () => ({
  spawn: mockSpawn,
}));

/**
 * A stdin that can fail the way a real one does.
 *
 * The previous stand-in was `{ write: jest.fn(), end: jest.fn() }`, which can
 * never emit anything - so the unhandled-EPIPE crash that `-t` introduces was
 * invisible to every test here. An EventEmitter lets a test raise the error
 * for real, and `emit('error')` with no listener throws, which is exactly the
 * unhandled 'error' event that kills the real process.
 */
function fakeStdin() {
  const stdin = new EventEmitter() as any;
  stdin.write = jest.fn();
  stdin.end = jest.fn();
  return stdin;
}

/** A stand-in ffmpeg that emits `output` on stdout/`stderrText` on stderr and exits with `code`. */
function fakeFfmpeg(output: Buffer, code = 0, stderrText = '') {
  const child = new EventEmitter() as any;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.stdin = fakeStdin();

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
    child.stdin = fakeStdin();
    mockSpawn.mockImplementation(() => {
      process.nextTick(() => child.emit('error', new Error('spawn ffmpeg ENOENT')));
      return child;
    });

    await expect(toWavBuffer(Buffer.from('bad'))).rejects.toThrow('spawn ffmpeg ENOENT');
  });

  describe('stdin EPIPE', () => {
    /** The error a write into a pipe ffmpeg has already closed produces. */
    function epipe(): NodeJS.ErrnoException {
      return Object.assign(new Error('write EPIPE'), { code: 'EPIPE' });
    }

    it('survives the EPIPE that -t causes once ffmpeg stops reading stdin', async () => {
      const wavOut = Buffer.from('RIFF....WAVEfmt ');
      // With `-t`, ffmpeg exits as soon as it has enough output and 'close'
      // fires while megabytes are still queued in stdin; only then does the
      // write fail. Verified against real ffmpeg 8.0.1 with a 10-minute Opus
      // clip small enough to pass the source-size guard.
      //
      // `emit('error')` on an emitter with no listener throws, which IS the
      // unhandled 'error' event that kills the process, so anything caught
      // here is an escape.
      const escaped: Error[] = [];

      mockSpawn.mockImplementation(() => {
        const child = fakeFfmpeg(wavOut);
        process.nextTick(() => {
          try {
            child.stdin.emit('error', epipe());
          } catch (error) {
            escaped.push(error as Error);
          }
        });
        return child;
      });

      await expect(toWavBuffer(Buffer.from('a'.repeat(4096)))).resolves.toEqual(wavOut);
      await new Promise((resolve) => setImmediate(resolve));

      expect(escaped).toEqual([]);
    });

    it('catches an EPIPE raised by the write itself, so the handler must precede it', async () => {
      const wavOut = Buffer.from('RIFF....WAVEfmt ');

      mockSpawn.mockImplementation(() => {
        const child = fakeFfmpeg(wavOut);
        // A pipe already closed by an exited ffmpeg fails inside write().
        // Nothing catches that throw, so if the handler were attached after
        // the write, it would escape the executor and reject the promise.
        child.stdin.write.mockImplementation(() => {
          child.stdin.emit('error', epipe());
          return false;
        });
        return child;
      });

      await expect(toWavBuffer(Buffer.from('a'))).resolves.toEqual(wavOut);
    });

    it('swallows a non-EPIPE stdin error without settling the promise', async () => {
      const wavOut = Buffer.from('RIFF....WAVEfmt ');
      const escaped: Error[] = [];

      mockSpawn.mockImplementation(() => {
        const child = fakeFfmpeg(wavOut);
        process.nextTick(() => {
          try {
            child.stdin.emit('error', Object.assign(new Error('broken'), { code: 'ECONNRESET' }));
          } catch (error) {
            escaped.push(error as Error);
          }
        });
        return child;
      });

      // 'close' is the only thing allowed to settle this promise - an stdin
      // error of any kind must not pre-empt it with a worse answer.
      await expect(toWavBuffer(Buffer.from('a'))).resolves.toEqual(wavOut);
      await new Promise((resolve) => setImmediate(resolve));

      expect(escaped).toEqual([]);
    });

    it('survives the EPIPE the byte-ceiling SIGKILL causes', async () => {
      const child = new EventEmitter() as any;
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      child.stdin = fakeStdin();
      child.kill = jest.fn();
      const escaped: Error[] = [];

      mockSpawn.mockImplementation(() => {
        process.nextTick(() => {
          const over = Buffer.alloc(MAX_DECODE_STDOUT_BYTES + 1);
          child.stdout.emit('data', over);
          // SIGKILL severs the pipe the pending write is still feeding.
          try {
            child.stdin.emit('error', epipe());
          } catch (error) {
            escaped.push(error as Error);
          }
          child.emit('close', null);
        });
        return child;
      });

      await expect(toWavBuffer(Buffer.from('bad'))).rejects.toThrow(/exceeded/);
      expect(escaped).toEqual([]);
    });
  });

  it('kills ffmpeg and rejects if stdout exceeds the byte ceiling despite the -t cap', async () => {
    const child = new EventEmitter() as any;
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.stdin = fakeStdin();
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
