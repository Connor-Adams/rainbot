import { Client, Events } from 'discord.js';
import { ORCHESTRATOR_BOT_ID } from '../config';
import { guildStates } from '../state/guild-state';
import { isVoiceInteractionEnabled } from '../voice-interaction';
import { log } from '../config';

export function registerVoiceStateHandlers(client: Client): void {
  client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
    const userId = newState.member?.id || oldState.member?.id;
    const guildId = newState.guild?.id || oldState.guild?.id;
    const user = newState.member?.user || oldState.member?.user;

    if (!userId || !guildId || user?.bot) return;
    if (userId === ORCHESTRATOR_BOT_ID) return;

    const { getVoiceInteractionManager } = require('@voice/voiceInteractionInstance');
    const voiceInteractionMgr = getVoiceInteractionManager();

    const state = guildStates.get(guildId);
    if (!state || !state.connection) return;

    const botChannelId = state.connection.joinConfig.channelId;

    if (oldState.channelId === botChannelId && newState.channelId !== botChannelId) {
      if (voiceInteractionMgr) {
        try {
          await voiceInteractionMgr.stopListening(userId, guildId);
          log.debug(`Stopped voice listening for user ${userId}`);
        } catch (error) {
          log.debug(`Failed to stop voice listening: ${(error as Error).message}`);
        }
      }
    }

    if (newState.channelId === botChannelId && oldState.channelId !== botChannelId) {
      if (voiceInteractionMgr) {
        const enabled = await isVoiceInteractionEnabled(guildId);
        if (enabled) {
          try {
            await voiceInteractionMgr.startListening(userId, guildId, state.connection);
            log.info(`✅ Started voice listening for user ${user?.tag || userId}`);
          } catch (error) {
            log.error(`Failed to start voice listening: ${(error as Error).message}`);
          }
        }
      }
    }
  });
}
