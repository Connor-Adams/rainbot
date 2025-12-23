import type { ClearResult } from '../../types/commands';

const voiceManager = require('../../utils/voiceManager');
const { createLogger } = require('../../utils/logger');

const log = createLogger('CLEAR');

export interface ClearExecuteResult {
  success: boolean;
  error?: string;
  result?: ClearResult;
}

export function executeClear(guildId: string): ClearExecuteResult {
  const status = voiceManager.getStatus(guildId);
  if (!status) {
    return {
      success: false,
      error:
        "❌ I'm not in a voice channel! Use `/join` to connect me to your voice channel first.",
    };
  }

  try {
    const cleared = voiceManager.clearQueue(guildId);
    const { nowPlaying } = voiceManager.getQueue(guildId);

    log.info(`Cleared ${cleared} tracks`);

    return {
      success: true,
      result: {
        cleared,
        nowPlaying: nowPlaying || null,
      },
    };
  } catch (error: any) {
    log.error(`Clear error: ${error.message}`);
    return {
      success: false,
      error: `❌ ${error.message}`,
    };
  }
}

export function formatClearMessage(result: ClearResult): string {
  const currentTrack = result.nowPlaying ? `\n\n▶️ Still playing: **${result.nowPlaying}**` : '';

  if (result.cleared === 0) {
    return `📋 Queue was already empty.${currentTrack}`;
  } else {
    return `🗑️ Cleared **${result.cleared}** track${result.cleared === 1 ? '' : 's'} from the queue.${currentTrack}`;
  }
}
