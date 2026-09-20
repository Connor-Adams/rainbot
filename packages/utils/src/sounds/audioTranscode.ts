import { spawn } from 'child_process';

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

    ffmpeg.stdout.on('data', (chunk: Buffer) => {
      if (killedForSize) return;
      stdoutBytes += chunk.length;
      if (stdoutBytes > MAX_DECODE_STDOUT_BYTES) {
        killedForSize = true;
        ffmpeg.kill('SIGKILL');
        return;
      }
      stdoutChunks.push(chunk);
    });
    ffmpeg.stderr.on('data', (chunk: Buffer) => stderrChunks.push(chunk));
    ffmpeg.on('error', (error) => reject(error));
    ffmpeg.on('close', (code) => {
      if (killedForSize) {
        reject(
          new Error(
            `ffmpeg output exceeded ${MAX_DECODE_STDOUT_BYTES} bytes before the -t ${MAX_DECODE_SECONDS}s cap stopped it`
          )
        );
        return;
      }
      if (code === 0) {
        resolve(Buffer.concat(stdoutChunks));
      } else {
        const stderr = Buffer.concat(stderrChunks).toString('utf8');
        reject(new Error(stderr || `ffmpeg exited with code ${code}`));
      }
    });

    ffmpeg.stdin.write(buffer);
    ffmpeg.stdin.end();
  });
}
