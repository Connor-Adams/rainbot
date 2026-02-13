/**
 * Play PCM from xAI Voice Agent (24kHz mono s16le) in Discord via TTS player.
 */
import { writeFile, unlink } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomBytes } from 'crypto';
import type { VoiceConnection } from '@discordjs/voice';
import { playTTSAudio } from '@voice/ttsPlayer';
import { createLogger } from '@rainbot/shared';

const log = createLogger('VOICE_AGENT_PLAY');

const SAMPLE_RATE = 24000;
const CHANNELS = 1;
const BITS_PER_SAMPLE = 16;

/** Build a minimal WAV file buffer (44-byte header + PCM). */
function buildWavBuffer(pcm: Buffer): Buffer {
  const dataSize = pcm.length;
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(CHANNELS, 22);
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(SAMPLE_RATE * CHANNELS * (BITS_PER_SAMPLE / 8), 28);
  header.writeUInt16LE(CHANNELS * (BITS_PER_SAMPLE / 8), 32);
  header.writeUInt16LE(BITS_PER_SAMPLE, 34);
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);
  return Buffer.concat([header, pcm]);
}

/**
 * Write PCM to a temp WAV file, play it in the guild, then delete the file.
 */
export async function playVoiceAgentAudio(
  guildId: string,
  connection: VoiceConnection,
  pcmBuffer: Buffer
): Promise<void> {
  if (pcmBuffer.length === 0) return;
  const tempPath = join(tmpdir(), `voice-agent-${randomBytes(8).toString('hex')}.wav`);
  try {
    const wav = buildWavBuffer(pcmBuffer);
    await writeFile(tempPath, wav);
    await playTTSAudio(guildId, connection, tempPath);
  } catch (e) {
    log.warn(`Voice Agent play failed: ${(e as Error).message}`);
  } finally {
    try {
      await unlink(tempPath);
    } catch {
      // ignore
    }
  }
}
