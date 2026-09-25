import { Events, VoiceState } from 'discord.js';
import { MultiBotService } from '../../lib/multiBotService';
import { VoiceStateManager } from '../../lib/voiceStateManager';
import { createLogger } from '@rainbot/utils/logger';

const log = createLogger('VOICE-STATE-UPDATE');

/**
 * The event loader invokes handlers with only the gateway's own arguments, so
 * the tracker resolves its VoiceStateManager from the MultiBotService singleton.
 * The explicit parameter stays for tests and direct callers.
 */
function resolveVoiceStateManager(injected?: VoiceStateManager): VoiceStateManager | null {
  if (injected) return injected;
  if (!MultiBotService.isInitialized()) return null;
  return MultiBotService.getInstance().getVoiceStateManager();
}

export default {
  name: Events.VoiceStateUpdate,
  async execute(oldState: VoiceState, newState: VoiceState, injected?: VoiceStateManager) {
    // Ignore if channel didn't change
    if (oldState.channelId === newState.channelId) return;

    const userId = newState.member?.id || oldState.member?.id;
    const guildId = newState.guild?.id || oldState.guild?.id;

    if (!userId || !guildId) return;

    // Ignore bot's own voice state changes
    if (newState.member?.user.bot || oldState.member?.user.bot) return;

    const voiceStateManager = resolveVoiceStateManager(injected);
    if (!voiceStateManager) {
      log.debug('MultiBotService not initialized, skipping voice state tracking');
      return;
    }

    try {
      // User joined/moved to a channel
      if (newState.channelId) {
        await voiceStateManager.setCurrentChannel(guildId, userId, newState.channelId);
        await voiceStateManager.setLastChannel(guildId, userId, newState.channelId);
        log.debug(
          `User ${userId} joined/moved to channel ${newState.channelId} in guild ${guildId}`
        );
      }
      // User left voice
      else if (oldState.channelId && !newState.channelId) {
        await voiceStateManager.setCurrentChannel(guildId, userId, null);
        log.debug(`User ${userId} left voice in guild ${guildId}`);
      }
    } catch (error) {
      log.error(`Error tracking voice state: ${error}`);
    }
  },
};
