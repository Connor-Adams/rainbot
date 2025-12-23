import type { StopResult } from '../../types/commands';

const voiceManager = require('../../utils/voiceManager');
const { createLogger } = require('../../utils/logger');

const log = createLogger('STOP');

export interface StopExecuteResult {
  success: boolean;
  error?: string;
}

export function executeStop(guildId: string): StopExecuteResult {
  const status = voiceManager.getStatus(guildId);
  if (!status) {
    return {
      success: false,
      error:
        "❌ I'm not in a voice channel! Use `/join` to connect me to your voice channel first.",
    };
  }

  try {
    const stopped = voiceManager.stopSound(guildId);

    if (stopped) {
      log.info('Stopped');
      return {
        success: true,
      };
    } else {
      return {
        success: false,
        error: '❌ Nothing is playing. Use `/play` to start playback.',
      };
    }
  } catch (error: any) {
    log.error(`Stop error: ${error.message}`);
    return {
      success: false,
      error: `❌ ${error.message}`,
    };
  }
}
