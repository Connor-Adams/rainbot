import { Client, Events } from 'discord.js';
import type { VoiceConnection } from '@discordjs/voice';
import { ORCHESTRATOR_BOT_ID } from '../config';
import { guildStates } from '../state/guild-state';
import { isVoiceInteractionEnabled } from '../voice-interaction';
import { log } from '../config';

/**
 * Subscribe the voice-interaction manager to every (non-bot) member currently in
 * the bot's voice channel. Members already in the channel never fire a
 * "user joined" event, so this is how we start listening to them — on bot join
 * (VoiceStateUpdate) and when conversation mode is turned on while already
 * connected (setConversationListening RPC). Skips users we're already listening
 * to (startListening is not idempotent — it would double-subscribe).
 */
export async function startListeningForChannelMembers(
  client: Client,
  guildId: string,
  connection: VoiceConnection
): Promise<void> {
  const { getVoiceInteractionManager } = require('@rainbot/utils/voice/voiceInteractionInstance');
  const voiceInteractionMgr = getVoiceInteractionManager();
  if (!voiceInteractionMgr) return;

  const channelId = connection.joinConfig.channelId;
  const channel = channelId
    ? client.guilds.cache.get(guildId)?.channels.cache.get(channelId)
    : undefined;
  if (!channel?.isVoiceBased() || !('members' in channel)) return;

  for (const [memberId, member] of channel.members) {
    if (member.user.bot) continue;
    if (voiceInteractionMgr.isListeningToUser(guildId, memberId)) continue;
    try {
      await voiceInteractionMgr.startListening(memberId, guildId, connection);
      log.info(`✅ Started voice listening for existing user ${member.user.tag ?? memberId}`);
    } catch (error) {
      log.debug(`Failed to start voice listening for ${memberId}: ${(error as Error).message}`);
    }
  }
}

export function registerVoiceStateHandlers(client: Client): void {
  client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
    const userId = newState.member?.id || oldState.member?.id;
    const guildId = newState.guild?.id || oldState.guild?.id;
    const user = newState.member?.user || oldState.member?.user;

    if (!userId || !guildId) return;

    const { getVoiceInteractionManager } = require('@rainbot/utils/voice/voiceInteractionInstance');
    const voiceInteractionMgr = getVoiceInteractionManager();

    const state = guildStates.get(guildId);
    if (!state || !state.connection) return;

    const botChannelId = state.connection.joinConfig.channelId;

    // When our bot joins a channel, start listening for all members already in that channel
    // (they never get a "user joined" event because they were there first)
    if (userId === client.user?.id && newState.channelId === botChannelId) {
      const enabled = await isVoiceInteractionEnabled(guildId);
      if (enabled) {
        await startListeningForChannelMembers(client, guildId, state.connection);
      }
      return;
    }

    if (user?.bot) return;
    if (userId === ORCHESTRATOR_BOT_ID) return;

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
