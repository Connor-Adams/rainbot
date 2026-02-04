import { log, REDIS_URL } from './config';
import { getRedisClient } from './queue/tts-worker';

export async function isVoiceInteractionEnabled(guildId: string): Promise<boolean> {
  const redisClient = getRedisClient();
  if (!redisClient || !REDIS_URL) {
    const { getVoiceInteractionManager } = require('@voice/voiceInteractionInstance');
    const voiceInteractionMgr = getVoiceInteractionManager();
    return voiceInteractionMgr?.isEnabledForGuild(guildId) ?? false;
  }

  try {
    const key = `voice:interaction:enabled:${guildId}`;
    const data = await redisClient.get(key);
    const enabled = data === '1';

    const { getVoiceInteractionManager } = require('@voice/voiceInteractionInstance');
    const voiceInteractionMgr = getVoiceInteractionManager();
    if (voiceInteractionMgr) {
      const currentlyEnabled = voiceInteractionMgr.isEnabledForGuild(guildId);
      if (enabled && !currentlyEnabled) {
        await voiceInteractionMgr.enableForGuild(guildId);
      } else if (!enabled && currentlyEnabled) {
        await voiceInteractionMgr.disableForGuild(guildId);
      }
    }

    return enabled;
  } catch (error) {
    log.warn(`Failed to check voice interaction enabled state: ${(error as Error).message}`);
    const { getVoiceInteractionManager } = require('@voice/voiceInteractionInstance');
    const voiceInteractionMgr = getVoiceInteractionManager();
    return voiceInteractionMgr?.isEnabledForGuild(guildId) ?? false;
  }
}
