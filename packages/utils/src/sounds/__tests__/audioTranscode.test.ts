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

import {
  toWavBuffer,
  wasDecodeTruncated,
  patchPipedWavSizes,
  CANONICAL_DATA_OFFSET,
  MAX_DECODE_SECONDS,
  MAX_DECODE_STDOUT_BYTES,
  DECODED_BYTES_PER_SECOND,
  MIN_ANALYSIS_SECONDS,
} from '../audioTranscode';

const UNKNOWN = 0xffffffff;

/** A `fmt ` chunk of the shape ffmpeg emits for 16kHz mono `pcm_s16le`. */
function fmtChunk(): Buffer {
  const chunk = Buffer.alloc(8 + 16);
  chunk.write('fmt ', 0, 'latin1');
  chunk.writeUInt32LE(16, 4);
  chunk.writeUInt16LE(1, 8); // PCM
  chunk.writeUInt16LE(1, 10); // mono
  chunk.writeUInt32LE(16000, 12);
  chunk.writeUInt32LE(32000, 16);
  chunk.writeUInt16LE(2, 20);
  chunk.writeUInt16LE(16, 22);
  return chunk;
}

/** The `LIST`/`INFO` chunk real ffmpeg writes between `fmt ` and `data`. */
function listChunk(): Buffer {
  const body = Buffer.concat([
    Buffer.from('INFO', 'latin1'),
    Buffer.from('ISFT', 'latin1'),
    (() => {
      const size = Buffer.alloc(4);
      size.writeUInt32LE(14, 0);
      return size;
    })(),
    Buffer.from('Lavf62.3.100\0\0', 'latin1'),
  ]);
  const header = Buffer.alloc(8);
  header.write('LIST', 0, 'latin1');
  header.writeUInt32LE(body.length, 4);
  return Buffer.concat([header, body]);
}

/**
 * A WAV laid out the way ffmpeg writes one to a non-seekable pipe: both size
 * fields hold the unknown-length sentinel.
 */
function pipedStyleWav(payload: Buffer, middle: Buffer[] = []): Buffer {
  const dataHeader = Buffer.alloc(8);
  dataHeader.write('data', 0, 'latin1');
  dataHeader.writeUInt32LE(UNKNOWN, 4);

  const riff = Buffer.alloc(12);
  riff.write('RIFF', 0, 'latin1');
  riff.writeUInt32LE(UNKNOWN, 4);
  riff.write('WAVE', 8, 'latin1');

  return Buffer.concat([riff, fmtChunk(), ...middle, dataHeader, payload]);
}

/** The offset of the `data` chunk's size field, found by walking the chunks. */
function dataSizeOffset(wav: Buffer): number {
  let offset = 12;
  while (offset + 8 <= wav.length) {
    const id = wav.subarray(offset, offset + 4).toString('latin1');
    if (id === 'data') return offset + 4;
    const size = wav.readUInt32LE(offset + 4);
    offset += 8 + size + (size % 2);
  }
  throw new Error('no data chunk');
}

/**
 * ffmpeg cannot seek backwards on a pipe, so it cannot patch the RIFF header
 * after writing the audio and declares ~4 GiB instead. Those bytes are base64'd
 * straight into an `input_audio` part declared `format: 'wav'`.
 *
 * No real ffmpeg is spawned here: the layouts below are the ones ffmpeg 8.0.1
 * was observed to produce, reconstructed byte for byte.
 */
describe('patchPipedWavSizes', () => {
  it('replaces both unknown-length sentinels with the real lengths', () => {
    const payload = Buffer.alloc(64000, 7);
    const wav = pipedStyleWav(payload);
    expect(wav.readUInt32LE(4)).toBe(UNKNOWN);
    expect(wav.readUInt32LE(dataSizeOffset(wav))).toBe(UNKNOWN);

    const patched = patchPipedWavSizes(wav);

    expect(patched.readUInt32LE(4)).toBe(patched.length - 8);
    expect(patched.readUInt32LE(dataSizeOffset(patched))).toBe(payload.length);
    // The audio itself is untouched, and so is the byte length that
    // `wasDecodeTruncated` reads.
    expect(patched.length).toBe(wav.length);
    expect(patched.subarray(patched.length - payload.length)).toEqual(payload);
  });

  it('patches a layout with a LIST chunk before data', () => {
    // Real ffmpeg 8.0.1 output is not the canonical 44-byte header: it writes
    // a LIST/INFO chunk naming its own version, which put `data` at byte 70 in
    // the measured case. A fixed-offset patch writes over that chunk.
    const payload = Buffer.alloc(1024, 3);
    const list = listChunk();
    const wav = pipedStyleWav(payload, [list]);
    const before = Buffer.from(wav.subarray(36, 36 + list.length));
    expect(dataSizeOffset(wav)).toBeGreaterThan(36 + list.length);

    const patched = patchPipedWavSizes(wav);

    expect(patched.readUInt32LE(4)).toBe(patched.length - 8);
    expect(patched.readUInt32LE(dataSizeOffset(patched))).toBe(payload.length);
    // The LIST chunk survives intact.
    expect(patched.subarray(36, 36 + list.length)).toEqual(before);
  });

  it('leaves a buffer that is not RIFF/WAVE alone', () => {
    const notWav = Buffer.from('OggS\x00\x02not a wav at all, really', 'latin1');
    const before = Buffer.from(notWav);
    expect(patchPipedWavSizes(notWav)).toEqual(before);

    // RIFF, but not a WAVE - an AVI, say.
    const riffNotWave = Buffer.concat([
      Buffer.from('RIFF', 'latin1'),
      Buffer.alloc(4, 0xff),
      Buffer.from('AVI ', 'latin1'),
      Buffer.alloc(16, 1),
    ]);
    const avi = Buffer.from(riffNotWave);
    expect(patchPipedWavSizes(riffNotWave)).toEqual(avi);

    // Too short to hold a RIFF header at all.
    expect(patchPipedWavSizes(Buffer.alloc(0))).toEqual(Buffer.alloc(0));
  });

  it('leaves real declared lengths alone rather than rewriting them', () => {
    // A WAV that was written to a seekable output already carries true sizes,
    // and may have chunks after `data`. Rewriting its data size to "everything
    // to the end of the buffer" would be corruption.
    const payload = Buffer.alloc(512, 9);
    const trailing = listChunk();
    const wav = pipedStyleWav(payload, []);
    wav.writeUInt32LE(payload.length, dataSizeOffset(wav));
    wav.writeUInt32LE(wav.length - 8, 4);
    const wellFormed = Buffer.concat([wav, trailing]);
    wellFormed.writeUInt32LE(wellFormed.length - 8, 4);
    const before = Buffer.from(wellFormed);

    expect(patchPipedWavSizes(wellFormed)).toEqual(before);
  });

  it('leaves a WAVE with no data chunk alone', () => {
    const wav = Buffer.concat([
      Buffer.from('RIFF', 'latin1'),
      (() => {
        const size = Buffer.alloc(4);
        size.writeUInt32LE(UNKNOWN, 0);
        return size;
      })(),
      Buffer.from('WAVE', 'latin1'),
      fmtChunk(),
    ]);
    const before = Buffer.from(wav);

    expect(patchPipedWavSizes(wav)).toEqual(before);
  });
});

/**
 * The layout the ffmpeg flags are there to produce.
 *
 * Measured against ffmpeg 8.0.1 by piping a one-second `sine=frequency=440`
 * Opus clip through the exact argument list `toWavBuffer` passes:
 *
 *   without the flags:  RIFF....WAVEfmt ....LIST....INFOISFT....Lavf62.3.100..data
 *                       -> `data` id at byte 70, samples at 78
 *   with them:          RIFF....WAVEfmt ....data
 *                       -> `data` id at byte 36, samples at 44
 *
 * Reconstructed here byte for byte; no ffmpeg is spawned.
 */
describe('canonical wav layout', () => {
  it('puts the data chunk where a 44-byte-header reader expects it', () => {
    const payload = Buffer.alloc(32000, 5);
    const wav = patchPipedWavSizes(pipedStyleWav(payload));

    expect(wav.subarray(CANONICAL_DATA_OFFSET, CANONICAL_DATA_OFFSET + 4).toString('latin1')).toBe(
      'data'
    );
    expect(dataSizeOffset(wav)).toBe(CANONICAL_DATA_OFFSET + 4);
    // 12 bytes of RIFF/size/WAVE + a 24-byte `fmt ` chunk + 8 bytes of `data`
    // header is the textbook 44, and the samples start exactly there.
    expect(CANONICAL_DATA_OFFSET + 8).toBe(44);
    expect(wav.subarray(44)).toEqual(payload);
    expect(wav.readUInt32LE(CANONICAL_DATA_OFFSET + 4)).toBe(payload.length);
  });

  it('is what the LIST-chunk layout breaks, which is the bug being fixed', () => {
    // The layout ffmpeg emits without `-map_metadata -1`. A reader that skips
    // 44 bytes lands inside ffmpeg's own version string and stays misaligned.
    const payload = Buffer.alloc(32000, 5);
    const stale = patchPipedWavSizes(pipedStyleWav(payload, [listChunk()]));

    expect(
      stale.subarray(CANONICAL_DATA_OFFSET, CANONICAL_DATA_OFFSET + 4).toString('latin1')
    ).toBe('LIST');
    expect(dataSizeOffset(stale)).toBe(70 + 4);
    expect(stale.subarray(44)).not.toEqual(payload);
    // The 34 stray bytes are a rounding error across 45 seconds of audio and a
    // real fraction of a one-second clip - which is why short clips failed.
    expect(stale.length - 44 - payload.length).toBe(34);
  });
});

describe('wasDecodeTruncated', () => {
  const cap = MAX_DECODE_SECONDS * DECODED_BYTES_PER_SECOND;

  it('matches the rate the ffmpeg flags fix', () => {
    // 16kHz mono 16-bit, per the -ar/-ac/-c:a flags toWavBuffer passes.
    expect(DECODED_BYTES_PER_SECOND).toBe(16000 * 2);
  });

  it('is false for a clip that decoded in full', () => {
    expect(wasDecodeTruncated(Buffer.alloc(5 * DECODED_BYTES_PER_SECOND))).toBe(false);
    expect(wasDecodeTruncated(Buffer.alloc(cap - 1))).toBe(false);
  });

  it('is true at the cap and beyond, header included', () => {
    expect(wasDecodeTruncated(Buffer.alloc(cap))).toBe(true);
    // ffmpeg's wav header sits on top of the samples, so a genuinely capped
    // decode lands past the threshold rather than on it.
    expect(wasDecodeTruncated(Buffer.alloc(cap + 78))).toBe(true);
  });

  /**
   * The padding filter lengthens output and the `-t` cap shortens it, and this
   * predicate can only see the result. These are the two buffers production
   * actually produces on either side of that, sized off the same constants the
   * ffmpeg flags are built from.
   */
  describe('with silence padding in play', () => {
    /** A `MIN_ANALYSIS_SECONDS` buffer: what a sub-second clip pads out to. */
    const padded = MIN_ANALYSIS_SECONDS * DECODED_BYTES_PER_SECOND + 44;

    it('does not report a padded short clip as truncated', () => {
      expect(wasDecodeTruncated(Buffer.alloc(padded))).toBe(false);
    });

    it('still reports a genuinely capped long clip as truncated', () => {
      // 45 seconds of source decoded under `-t 30` lands here; `apad` adds
      // nothing to it.
      expect(wasDecodeTruncated(Buffer.alloc(cap + 44))).toBe(true);
    });

    it('leaves room no amount of padding can close', () => {
      // The structural reason the two cases above cannot collide: padding tops
      // out at MIN_ANALYSIS_SECONDS, which is a small fraction of the cap. If
      // anyone ever raises MIN_ANALYSIS_SECONDS toward MAX_DECODE_SECONDS, this
      // fails before the misreport reaches production.
      expect(MIN_ANALYSIS_SECONDS).toBeLessThan(MAX_DECODE_SECONDS);
      expect(padded).toBeLessThan(cap);
    });
  });
});

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
      // Short clips come back from the caption model as "I'm unable to listen
      // to audio"; trailing silence up to MIN_ANALYSIS_SECONDS clears that
      // floor. `whole_dur` is a target, so this is a no-op above it.
      '-af',
      `apad=whole_dur=${MIN_ANALYSIS_SECONDS}`,
      '-ar',
      '16000',
      '-ac',
      '1',
      '-c:a',
      'pcm_s16le',
      // Without these ffmpeg interposes a LIST/INFO chunk holding its build
      // string, pushing `data` from 36 to 70.
      '-map_metadata',
      '-1',
      '-fflags',
      '+bitexact',
      '-f',
      'wav',
      'pipe:1',
    ]);

    const child = mockSpawn.mock.results[0].value;
    expect(child.stdin.write).toHaveBeenCalledWith(input);
    expect(child.stdin.end).toHaveBeenCalled();
  });

  describe('silence padding', () => {
    /** Pull the `-af` value out of the args ffmpeg was actually spawned with. */
    function filterArg(): string | undefined {
      const args = mockSpawn.mock.calls[0][1] as string[];
      const at = args.indexOf('-af');
      return at === -1 ? undefined : args[at + 1];
    }

    it('asks ffmpeg for a whole-duration target rather than unbounded padding', async () => {
      mockSpawn.mockImplementation(() => fakeFfmpeg(Buffer.from('RIFF....WAVEfmt ')));
      await toWavBuffer(Buffer.from('short-clip'));

      // A bare `apad` pads forever, and `-t MAX_DECODE_SECONDS` would then turn
      // every clip in the library into 30 seconds of mostly silence. The
      // duration target is the whole reason this is safe.
      expect(filterArg()).toBe(`apad=whole_dur=${MIN_ANALYSIS_SECONDS}`);
      expect(filterArg()).not.toBe('apad');
    });

    it('sends one filter chain, not a duplicate -af that would override it', async () => {
      mockSpawn.mockImplementation(() => fakeFfmpeg(Buffer.from('RIFF....WAVEfmt ')));
      await toWavBuffer(Buffer.from('short-clip'));

      const args = mockSpawn.mock.calls[0][1] as string[];
      expect(args.filter((a) => a === '-af')).toHaveLength(1);
    });

    it('is the same request whatever the clip, so a long clip is padded by nothing', async () => {
      // `whole_dur` is a minimum target: ffmpeg appends silence only up to it
      // and leaves a longer stream untouched. Verified against ffmpeg 8.0.1 -
      // a 3s clip's decoded output is byte-identical with and without this
      // filter - so the no-op lives in ffmpeg, and what this asserts is that
      // nothing here special-cases the two and gets the branch wrong.
      mockSpawn.mockImplementation(() => fakeFfmpeg(Buffer.from('RIFF....WAVEfmt ')));
      await toWavBuffer(Buffer.alloc(16));
      const shortArgs = mockSpawn.mock.calls[0][1];

      mockSpawn.mockReset();
      mockSpawn.mockImplementation(() => fakeFfmpeg(Buffer.from('RIFF....WAVEfmt ')));
      await toWavBuffer(Buffer.alloc(4 * 1024 * 1024));
      const longArgs = mockSpawn.mock.calls[0][1];

      expect(longArgs).toEqual(shortArgs);
    });

    it('does not lengthen the buffer the truncation check reads', async () => {
      // Padding happens inside ffmpeg; nothing on this side appends to what it
      // hands back. A stand-in that returns a padded-length buffer must still
      // read as untruncated once it comes through `toWavBuffer`.
      const paddedOut = pipedStyleWav(
        Buffer.alloc(MIN_ANALYSIS_SECONDS * DECODED_BYTES_PER_SECOND)
      );
      mockSpawn.mockImplementation(() => fakeFfmpeg(paddedOut));

      const result = await toWavBuffer(Buffer.from('short-clip'));

      expect(result.length).toBe(paddedOut.length);
      expect(wasDecodeTruncated(result)).toBe(false);
    });
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

    // Each chunk is over half the ceiling, so the second crosses it -
    // simulates a duration cap that, for whatever reason, did not stop the
    // stream.
    const half = Buffer.alloc(Math.ceil(MAX_DECODE_STDOUT_BYTES / 2) + 1);

    mockSpawn.mockImplementation(() => {
      process.nextTick(() => {
        child.stdout.emit('data', half);
        child.stdout.emit('data', half);
        // A real SIGKILL does not stop bytes already in flight from arriving.
        child.stdout.emit('data', half);
        // A real SIGKILL still delivers a 'close' event; the promise must
        // reject from the size check rather than resolving with partial data.
        child.emit('close', null);
      });
      return child;
    });

    // Rejecting and killing are necessary but nowhere near sufficient: both
    // still hold if the implementation accumulates every chunk and only then
    // rejects, which is the very bug the ceiling exists to prevent. What the
    // ceiling actually promises is that accumulation stays bounded, so pin
    // the retained byte count exactly. Only the first chunk may be held: the
    // second is refused because it would cross the ceiling, and the third
    // arrives after the kill.
    await expect(toWavBuffer(Buffer.from('bad'))).rejects.toThrow(
      `killed holding ${half.length} bytes`
    );
    expect(child.kill).toHaveBeenCalledWith('SIGKILL');
  });

  it('retains everything up to the ceiling without killing', async () => {
    // The boundary from the other side, so the exact-accumulation assertion
    // above cannot be satisfied by an implementation that simply drops more
    // than it should.
    const exact = Buffer.alloc(MAX_DECODE_STDOUT_BYTES);
    const child = new EventEmitter() as any;
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.stdin = fakeStdin();
    child.kill = jest.fn();

    mockSpawn.mockImplementation(() => {
      process.nextTick(() => {
        child.stdout.emit('data', exact);
        child.emit('close', 0);
      });
      return child;
    });

    const result = await toWavBuffer(Buffer.from('big'));

    expect(result.length).toBe(MAX_DECODE_STDOUT_BYTES);
    expect(child.kill).not.toHaveBeenCalled();
  });

  it('hands back a WAV whose declared lengths match its bytes', () => {
    // The wiring, not the patch: a decode that resolves must never hand the
    // caller the ~4 GiB header ffmpeg writes to a pipe, because that buffer
    // goes straight into an `input_audio` part declared `format: 'wav'`.
    const payload = Buffer.alloc(32000, 5);
    const piped = pipedStyleWav(payload, [listChunk()]);
    mockSpawn.mockImplementation(() => fakeFfmpeg(piped));

    return toWavBuffer(Buffer.from('fake-ogg-bytes')).then((result) => {
      expect(result.readUInt32LE(4)).toBe(result.length - 8);
      expect(result.readUInt32LE(dataSizeOffset(result))).toBe(payload.length);
    });
  });

  it('does not disturb the length the truncation check reads', async () => {
    // `wasDecodeTruncated` compares `wav.length` against the duration cap, and
    // the header repair must not move that number in either direction.
    const cap = MAX_DECODE_SECONDS * DECODED_BYTES_PER_SECOND;
    const atCap = pipedStyleWav(Buffer.alloc(cap, 1), [listChunk()]);
    mockSpawn.mockImplementation(() => fakeFfmpeg(atCap));

    const capped = await toWavBuffer(Buffer.from('long'));
    expect(capped.length).toBe(atCap.length);
    expect(wasDecodeTruncated(capped)).toBe(true);

    const shortWav = pipedStyleWav(Buffer.alloc(2 * DECODED_BYTES_PER_SECOND, 1), [listChunk()]);
    mockSpawn.mockImplementation(() => fakeFfmpeg(shortWav));

    const short = await toWavBuffer(Buffer.from('short'));
    expect(short.length).toBe(shortWav.length);
    expect(wasDecodeTruncated(short)).toBe(false);
  });
});
