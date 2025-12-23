import type { VolParams } from '../../types/commands';

const voiceManager = require('../../utils/voiceManager');
const { createLogger } = require('../../utils/logger');

const log = createLogger('VOLUME');

export interface VolExecuteResult {
  needsDefer: boolean;
  ephemeral?: boolean;
  content?: string;
}

export async function executeVol(params: VolParams): Promise<VolExecuteResult> {
  const { guildId, level } = params;

  const status = voiceManager.getStatus(guildId);
  if (!status) {
    return {
      needsDefer: false,
      ephemeral: true,
      content: "❌ I'm not in a voice channel.",
    };
  }

  // No level → just show current volume
  if (level === undefined || level === null) {
    return {
      needsDefer: false,
      ephemeral: true,
      content: `🔊 Current volume is **${status.volume}%**`,
    };
  }

  return {
    needsDefer: true,
  };
}

export async function executeVolDeferred(params: VolParams): Promise<VolExecuteResult> {
  const { guildId, level, userId } = params;

  try {
    voiceManager.setVolume(guildId, level);

    log.info(`Volume set to ${level}% by ${userId || 'unknown'} in ${guildId}`);

    return {
      needsDefer: false,
      content: `🔊 Volume set to **${level}%**`,
    };
  } catch (error: unknown) {
    const err = error as Error;
    log.error(`Failed to set volume: ${err.message}`);
    return {
      needsDefer: false,
      ephemeral: true,
      content: `❌ Failed to set volume: ${err.message}`,
    };
  }
}
