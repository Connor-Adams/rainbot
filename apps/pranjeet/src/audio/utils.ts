import { Readable } from 'stream';
import type { AudioPlayer } from '@discordjs/voice';
import { AudioPlayerStatus } from '@discordjs/voice';

export function waitForPlaybackEnd(player: AudioPlayer, timeoutMs = 30_000): Promise<void> {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      cleanup();
      resolve();
    };
    const cleanup = () => {
      clearTimeout(timer);
      player.off(AudioPlayerStatus.Idle, finish);
      player.off('error', finish);
    };
    const timer = setTimeout(finish, timeoutMs);
    if (player.state.status === AudioPlayerStatus.Idle) return finish();
    player.on(AudioPlayerStatus.Idle, finish);
    player.on('error', finish);
  });
}

export function chunkPcmIntoFrames(pcm: Buffer, frameBytes: number): Buffer[] {
  const frames: Buffer[] = [];
  if (pcm.length === 0) return frames;
  let i = 0;
  for (; i + frameBytes <= pcm.length; i += frameBytes) {
    frames.push(pcm.subarray(i, i + frameBytes));
  }
  const remaining = pcm.length - i;
  if (remaining > 0) {
    const last = Buffer.alloc(frameBytes);
    pcm.copy(last, 0, i);
    frames.push(last);
  }
  return frames;
}

export function framesToReadable(frames: Buffer[]): Readable {
  let idx = 0;
  return new Readable({
    read() {
      if (idx >= frames.length) return this.push(null);
      this.push(frames[idx++]);
    },
  });
}

/**
 * Resample 24kHz mono 16-bit PCM → 48kHz mono 16-bit PCM (2×) using cubic interpolation.
 */
export function resample24to48(pcm24k: Buffer): Buffer {
  if ((pcm24k.length & 1) === 1) {
    pcm24k = pcm24k.subarray(0, pcm24k.length - 1);
  }
  const inSamples = pcm24k.length >> 1;
  if (inSamples === 0) return Buffer.alloc(0);
  const outSamples = inSamples << 1;
  const out = Buffer.allocUnsafe(outSamples << 1);
  const read = (i: number) => {
    if (i < 0) i = 0;
    else if (i >= inSamples) i = inSamples - 1;
    return pcm24k.readInt16LE(i << 1);
  };
  let o = 0;
  for (let i = 0; i < inSamples; i++) {
    const s0 = read(i - 1);
    const s1 = read(i);
    const s2 = read(i + 1);
    const s3 = read(i + 2);
    out.writeInt16LE(s1, o);
    o += 2;
    const t = 0.5;
    const a = -0.5 * s0 + 1.5 * s1 - 1.5 * s2 + 0.5 * s3;
    const b = s0 - 2.5 * s1 + 2 * s2 - 0.5 * s3;
    const c = -0.5 * s0 + 0.5 * s2;
    const d = s1;
    const y = Math.round(a * t * t * t + b * t * t + c * t + d);
    out.writeInt16LE(Math.max(-32768, Math.min(32767, y)), o);
    o += 2;
  }
  return out;
}

export function monoToStereoPcm(pcmMono: Buffer): Buffer {
  const validLength = Math.floor(pcmMono.length / 2) * 2;
  const trimmed = validLength < pcmMono.length ? pcmMono.subarray(0, validLength) : pcmMono;
  const samples = trimmed.length / 2;
  const stereo = Buffer.alloc(samples * 4);
  for (let i = 0; i < samples; i++) {
    const sample = trimmed.readInt16LE(i * 2);
    const offset = i * 4;
    stereo.writeInt16LE(sample, offset);
    stereo.writeInt16LE(sample, offset + 2);
  }
  return stereo;
}
