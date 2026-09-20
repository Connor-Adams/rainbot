import { spawn } from 'child_process';
import { createLogger } from '../logger';

const log = createLogger('SOUND-TRANSCODE');

/**
 * Duration ffmpeg is told to stop decoding at, via `-t`.
 *
 * This is what actually bounds decode memory - without it, ffmpeg happily
 * decodes however long a stream the source claims to have before anyone
 * looks at the output size. An 8MB Opus file at ~32kbps is roughly 2000
 * seconds of audio, which decodes to ~64MB of 16kHz mono PCM: all of it
 * resident before the post-decode size guard in audioAnalyzer.ts ever runs.
 *
 * A soundboard clip is seconds long, not minutes - Discord's own soundboard
 * caps native sounds at ~5 seconds, and this bot's custom clips are
 * historically similar. 30 seconds is generous headroom over any legitimate
 * clip while capping decoded PCM at 16000 samples/sec * 2 bytes * 30s =
 * ~940KB, well under the 8MB post-decode guard rather than merely below it.
 */
export const MAX_DECODE_SECONDS = 30;

/**
 * Hard ceiling on ffmpeg's accumulated stdout, independent of the duration
 * cap above.
 *
 * With `-t` honored, decoded output tops out under 1MB (see
 * MAX_DECODE_SECONDS), so in normal operation this never trips. It exists
 * purely as a second line of defense against `-t` failing to do its job for
 * some reason ffmpeg-version- or stream-specific: a broken duration cap then
 * degrades to "reject this file" once stdout crosses a threshold no
 * legitimate decode could reach, rather than "decode an unbounded stream in
 * full anyway". Set well above MAX_DECODE_SECONDS' expected output (~8x) so
 * it only ever fires on a genuine runaway.
 */
export const MAX_DECODE_STDOUT_BYTES = 8 * 1024 * 1024;

/**
 * Bytes one second of the decoded stream occupies, fixed by the ffmpeg flags
 * below: 16000 samples/sec * 1 channel * 2 bytes per sample.
 */
export const DECODED_BYTES_PER_SECOND = 16000 * 2;

/**
 * Whether a decode came back at the `-t` cap, meaning ffmpeg stopped early and
 * the caller is holding only the clip's first MAX_DECODE_SECONDS.
 *
 * The output rate is fixed (see DECODED_BYTES_PER_SECOND), so length alone
 * answers this - no second spawn to probe the source. A clip shorter than the
 * cap always lands below the threshold; ffmpeg's wav header adds a few dozen
 * bytes on top, which only ever pushes a genuinely capped decode further past
 * it. The one imprecision is a clip whose true duration falls inside the last
 * couple of milliseconds before the cap, which reads as truncated - it is
 * within rounding of being exactly that, and the only consequence is a log
 * line.
 */
export function wasDecodeTruncated(wav: Buffer): boolean {
  return wav.length >= MAX_DECODE_SECONDS * DECODED_BYTES_PER_SECOND;
}

/**
 * The size a RIFF chunk carries when its true length was not known at the time
 * the header went out. ffmpeg writes this to a non-seekable output because it
 * cannot come back and patch the field afterwards.
 */
const UNKNOWN_CHUNK_SIZE = 0xffffffff;

/** Byte offset of the RIFF chunk's own size field. */
const RIFF_SIZE_OFFSET = 4;

/** Where the chunk list starts: past `RIFF`, the size field, and `WAVE`. */
const FIRST_CHUNK_OFFSET = 12;

/** Bytes of chunk header - a four-character id plus a `uint32le` size. */
const CHUNK_HEADER_BYTES = 8;

/**
 * Repairs the length fields of a WAV that ffmpeg wrote to a pipe.
 *
 * ffmpeg cannot seek backwards on a non-seekable output, so it cannot return
 * to the header and patch in the real lengths once the audio has been written.
 * It emits the "unknown" sentinel instead, and every WAV this module produces
 * therefore declares itself to be about 4 GiB. Verified against ffmpeg 8.0.1
 * with this function's own flags:
 *
 *   piped:   52 49 46 46 ff ff ff ff 57 41 56 45   RIFF....WAVE
 *            ...with the `data` chunk's size field also ffffffff
 *   to file: RIFF size = 65272, data size = 65202
 *
 * That buffer is base64'd straight into an `input_audio` part declared
 * `format: 'wav'`. ffmpeg-derived decoders read the sentinel as "read to EOF"
 * and cope; a strict parser rejects it or over-reads. A model handed a file
 * claiming 4 GiB of samples and given 60 KB may well describe a broken file
 * rather than its contents, which is the production symptom.
 *
 * The `data` chunk's offset is found by walking the chunk list, never assumed.
 * Real ffmpeg output is not the canonical 44-byte header: it emits a
 * `LIST`/`INFO` chunk carrying its own version string between `fmt ` and
 * `data`, putting `data` at byte 70 in the measured case. A fixed-offset patch
 * would have written the lengths over that chunk.
 *
 * Only the sentinel is rewritten. A size field that already holds a plausible
 * value is left exactly as it is, so a well-formed WAV - one with trailing
 * chunks after `data`, say - cannot be corrupted by this function. Anything
 * that is not the expected layout is likewise returned untouched, with a debug
 * line, rather than half-patched.
 *
 * The buffer's byte length is never changed, so `wasDecodeTruncated` - which
 * reads `wav.length` and nothing else - is unaffected by this.
 */
export function patchPipedWavSizes(wav: Buffer): Buffer {
  const ascii = (offset: number): string =>
    wav.length >= offset + 4 ? wav.subarray(offset, offset + 4).toString('latin1') : '';

  if (wav.length < FIRST_CHUNK_OFFSET || ascii(0) !== 'RIFF' || ascii(8) !== 'WAVE') {
    log.debug(`Decoded audio is not a RIFF/WAVE buffer (${wav.length} bytes) - leaving it as is`);
    return wav;
  }

  let offset = FIRST_CHUNK_OFFSET;
  while (offset + CHUNK_HEADER_BYTES <= wav.length) {
    const id = ascii(offset);
    const declared = wav.readUInt32LE(offset + 4);

    if (id === 'data') {
      const payload = wav.length - (offset + CHUNK_HEADER_BYTES);
      // Only the unknown-length sentinel is a lie worth correcting. A declared
      // size that fits inside the buffer is a real measurement - possibly with
      // chunks after it - and overwriting it with "everything to the end" would
      // be the corruption this patch exists to avoid.
      if (declared !== UNKNOWN_CHUNK_SIZE) return wav;
      wav.writeUInt32LE(payload, offset + 4);
      // The RIFF chunk covers everything after its own id and size field.
      wav.writeUInt32LE(wav.length - CHUNK_HEADER_BYTES, RIFF_SIZE_OFFSET);
      return wav;
    }

    // A non-`data` chunk of unknown length cannot be stepped over, and a size
    // that runs past the buffer means the layout is not what is assumed here.
    // Either way, stop rather than guess.
    if (declared === UNKNOWN_CHUNK_SIZE) break;
    // RIFF chunks are padded to an even length; the pad byte is not counted in
    // the declared size.
    const next = offset + CHUNK_HEADER_BYTES + declared + (declared % 2);
    if (next <= offset || next > wav.length) break;
    offset = next;
  }

  log.debug(
    `Decoded WAV has no locatable data chunk (${wav.length} bytes) - leaving its header as is`
  );
  return wav;
}

/**
 * Decodes an arbitrary audio buffer to 16kHz mono 16-bit PCM WAV via ffmpeg.
 *
 * Speech models want this format, and at 16kHz mono it is roughly a fifth
 * the size of 44.1kHz stereo once base64-encoded for an inline API payload.
 * Mirrors the ffmpeg-spawn pattern in `storage.ts`'s `transcodeToOggOpus`.
 */
export async function toWavBuffer(buffer: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', [
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

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let stdoutBytes = 0;
    let killedForSize = false;
    let bytesHeldAtKill = 0;

    ffmpeg.stdout.on('data', (chunk: Buffer) => {
      if (killedForSize) return;
      // Tested before accumulating rather than after, so the chunk that
      // crosses the ceiling is not retained either. That keeps `stdoutBytes`
      // equal to the bytes actually held in `stdoutChunks` at every moment,
      // which is the quantity the ceiling exists to bound - the old ordering
      // counted bytes it then went on to discard.
      if (stdoutBytes + chunk.length > MAX_DECODE_STDOUT_BYTES) {
        killedForSize = true;
        // Measured off the chunks themselves rather than read from
        // `stdoutBytes`. The two can only disagree if accumulation has drifted
        // away from the ceiling that is supposed to bound it - which is
        // exactly the failure this number needs to make visible, and a running
        // counter would keep reporting the reassuring figure while the array
        // grew past it. Only ever computed on this path, so the walk costs
        // nothing in normal operation.
        bytesHeldAtKill = stdoutChunks.reduce((total, held) => total + held.length, 0);
        // Release what was accumulated here, not when the promise finally
        // rejects. SIGKILL, the child's exit and 'close' are several ticks
        // apart; holding megabytes across that gap is exactly what this
        // ceiling exists to prevent.
        stdoutChunks.length = 0;
        ffmpeg.kill('SIGKILL');
        return;
      }
      stdoutBytes += chunk.length;
      stdoutChunks.push(chunk);
    });
    ffmpeg.stderr.on('data', (chunk: Buffer) => stderrChunks.push(chunk));
    ffmpeg.on('error', (error) => reject(error));
    ffmpeg.on('close', (code) => {
      if (killedForSize) {
        reject(
          new Error(
            `ffmpeg output exceeded ${MAX_DECODE_STDOUT_BYTES} bytes before the -t ${MAX_DECODE_SECONDS}s cap stopped it; killed holding ${bytesHeldAtKill} bytes`
          )
        );
        return;
      }
      if (code === 0) {
        // `Buffer.concat` hands back a fresh buffer that nothing else holds a
        // reference to, so the header repair is done in place on it. See
        // `patchPipedWavSizes` - ffmpeg could not write real lengths into a
        // pipe, and the byte length is left unchanged either way.
        resolve(patchPipedWavSizes(Buffer.concat(stdoutChunks)));
      } else {
        const stderr = Buffer.concat(stderrChunks).toString('utf8');
        reject(new Error(stderr || `ffmpeg exited with code ${code}`));
      }
    });

    // `-t` makes ffmpeg stop reading stdin and exit the moment it has enough
    // output, and the SIGKILL above severs the pipe outright - in both cases
    // Node may still have megabytes of source queued here, and the write end
    // fails with EPIPE. Without this listener that is an unhandled 'error'
    // event on the socket: Raincloud's handler (apps/raincloud/index.js) turns
    // it into a sticky `process.exitCode = 1` so every later clean shutdown
    // reports as a crash, and worker-shared's
    // (packages/worker-shared/src/errors/process.ts) into an outright
    // `process.exit(1)` mid-sweep. Verified against ffmpeg 8.0.1 with a
    // 10-minute Opus clip small enough to pass the source-size guard.
    //
    // It deliberately settles nothing. Every outcome is already covered: the
    // 'close' handler resolves an early exit 0 with the capped output (which
    // is what `-t` was for), rejects a non-zero exit with stderr, and rejects
    // the byte-ceiling kill; the child's own 'error' handler covers a spawn
    // that never starts. Rejecting here would only race those with a less
    // informative error, and resolving would be wrong outright.
    ffmpeg.stdin.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EPIPE') return;
      log.debug(`ffmpeg stdin error (${error.code ?? 'no code'}): ${error.message}`);
    });

    ffmpeg.stdin.write(buffer);
    ffmpeg.stdin.end();
  });
}
