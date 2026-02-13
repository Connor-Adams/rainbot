import { createAudioResource, StreamType } from '@discordjs/voice';
import {
  chunkPcmIntoFrames,
  framesToReadable,
  monoToStereoPcm,
  waitForPlaybackEnd,
} from './audio/utils';
import { getOrCreateGuildState } from './state/guild-state';
import { generateTTS, normalizeSpeakKey } from './tts';

const PCM_48K_FRAME_SAMPLES = 960;
const PCM_S16LE_BYTES_PER_SAMPLE = 2;
const PCM_48K_STEREO_FRAME_BYTES = PCM_48K_FRAME_SAMPLES * 2 * PCM_S16LE_BYTES_PER_SAMPLE;

export async function speakInGuild(
  guildId: string,
  text: string,
  voice?: string
): Promise<{ status: 'success' | 'error'; message: string }> {
  const state = getOrCreateGuildState(guildId);

  if (!state.connection) {
    return { status: 'error', message: 'Not connected to voice channel' };
  }

  const speakKey = normalizeSpeakKey(text, voice);
  const now = Date.now();

  if (speakKey === state.lastSpeakKey && now - state.lastSpeakAt < 1500) {
    return { status: 'success', message: 'Dropped duplicate TTS (burst dedupe)' };
  }
  state.lastSpeakKey = speakKey;
  state.lastSpeakAt = now;

  state.speakQueue = state.speakQueue
    .catch(() => undefined)
    .then(async () => {
      const pcm48kMono = await generateTTS(text, voice);
      if (!pcm48kMono || pcm48kMono.length === 0) return;

      const pcm48kStereo = monoToStereoPcm(pcm48kMono);
      const frames = chunkPcmIntoFrames(pcm48kStereo, PCM_48K_STEREO_FRAME_BYTES);
      if (frames.length === 0) return;

      const stream = framesToReadable(frames);
      const resource = createAudioResource(stream, {
        inputType: StreamType.Raw,
        inlineVolume: true,
      });

      if (resource.volume) resource.volume.setVolume(state.volume);
      state.currentResource = resource;
      state.player.play(resource);
      await waitForPlaybackEnd(state.player, 60_000);
      state.currentResource = null;
    });

  return { status: 'success', message: 'TTS queued' };
}
