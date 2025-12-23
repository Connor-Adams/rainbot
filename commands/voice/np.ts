import type { QueueInfo } from '../../types/voice';
import { createPlayerMessage } from '../../utils/playerEmbed';

const voiceManager = require('../../utils/voiceManager');

export interface NPResult {
  success: boolean;
  error?: string;
  playerMessage?: ReturnType<typeof createPlayerMessage>;
}

export function executeNP(guildId: string): NPResult {
  const status = voiceManager.getStatus(guildId);
  if (!status) {
    return {
      success: false,
      error:
        "❌ I'm not in a voice channel! Use `/join` to connect me to your voice channel first.",
    };
  }

  if (!status.nowPlaying) {
    return {
      success: false,
      error: '❌ Nothing is playing right now. Use `/play` to start playing music.',
    };
  }

  const queueInfo = voiceManager.getQueue(guildId) as QueueInfo;
  const { nowPlaying, queue, currentTrack } = queueInfo;
  const isPaused = !status.isPlaying;

  return {
    success: true,
    playerMessage: createPlayerMessage(nowPlaying, queue, isPaused, currentTrack, queueInfo),
  };
}
