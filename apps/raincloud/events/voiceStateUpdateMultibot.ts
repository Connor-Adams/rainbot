import { Events, VoiceState } from 'discord.js';
import { VoiceStateManager } from '../lib/voiceStateManager.ts';
import { createLogger } from '../utils/logger.ts';

const log = createLogger('VOICE-STATE-UPDATE');

export default {
  name: Events.VoiceStateUpdate,
  async execute(oldState: VoiceState, newState: VoiceState, voiceStateManager: VoiceStateManager) {
    // Ignore if channel didn't change
    if (oldState.channelId === newState.channelId) return;

    const userId = newState.member?.id || oldState.member?.id;
    const guildId = newState.guild?.id || oldState.guild?.id;

    if (!userId || !guildId) return;

    // Ignore bot's own voice state changes
    if (newState.member?.user.bot || oldState.member?.user.bot) return;

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
