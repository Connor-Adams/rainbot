import { spawn } from 'child_process';

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

    ffmpeg.stdout.on('data', (chunk: Buffer) => stdoutChunks.push(chunk));
    ffmpeg.stderr.on('data', (chunk: Buffer) => stderrChunks.push(chunk));
    ffmpeg.on('error', (error) => reject(error));
    ffmpeg.on('close', (code) => {
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
