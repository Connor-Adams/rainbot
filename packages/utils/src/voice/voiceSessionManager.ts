import {
  entersState,
  getVoiceConnection,
  joinVoiceChannel,
  VoiceConnectionStatus,
} from '@discordjs/voice';
import type { VoiceBasedChannel } from 'discord.js';
import { createLogger } from '../logger';
import { getVoiceInteractionManager } from './voiceInteractionInstance';

const log = createLogger('VOICE_SESSION');

interface EnsureSessionParams {
  guildId: string;
  voiceChannel: VoiceBasedChannel;
}

interface PermissionCheckResult {
  hasPermissions: boolean;
  errorMessage?: string;
}

function checkVoicePermissions(
  voiceChannel: VoiceBasedChannel,
  botUser: NonNullable<VoiceBasedChannel['client']['user']>
): PermissionCheckResult {
  const permissions = voiceChannel.permissionsFor(botUser);
  const missingPerms: string[] = [];

  if (!permissions?.has('Connect')) missingPerms.push('Connect');
  if (!permissions?.has('Speak')) missingPerms.push('Speak');

  if (missingPerms.length > 0) {
    return {
      hasPermissions: false,
      errorMessage: `Missing voice permissions in "${voiceChannel.name}": ${missingPerms.join(', ')}`,
    };
  }

  return { hasPermissions: true };
}

/**
 * Ensures a voice session exists for a guild.
 * Auto-joins the user's VC if bot is not connected.
 * Initializes voice interaction listening for existing members.
 */
export async function ensureSession({ guildId, voiceChannel }: EnsureSessionParams) {
  const botUser = voiceChannel.client.user;

  if (!botUser) {
    throw new Error('Bot user not available on voice channel client');
  }

  const perms = checkVoicePermissions(voiceChannel, botUser);
  if (!perms.hasPermissions) {
    throw new Error(perms.errorMessage || 'Missing voice channel permissions');
  }

  let connection = getVoiceConnection(guildId);
  if (!connection) {
    log.info(`Joining VC: ${voiceChannel.name} (${guildId})`);
    connection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId,
      adapterCreator: voiceChannel.guild.voiceAdapterCreator,
      selfDeaf: false,
      selfMute: false,
    });

    try {
      await entersState(connection, VoiceConnectionStatus.Ready, 10000);
    } catch (err) {
      connection.destroy();
      throw new Error(`Failed to connect to voice channel: ${(err as Error).message}`);
    }
  }

  const voiceInteractionMgr = getVoiceInteractionManager();
  if (voiceInteractionMgr && voiceInteractionMgr.isEnabledForGuild(guildId)) {
    const members = voiceChannel.members.filter((member) => !member.user.bot);
    for (const [userId, member] of members) {
      try {
        await voiceInteractionMgr.startListening(userId, guildId, connection);
        log.info(`Started voice listening for existing user: ${member.user.tag}`);
      } catch (err) {
        log.warn(`Failed to start listening for ${member.user.tag}: ${(err as Error).message}`);
      }
    }
  }

  return connection;
}

/**
 * Cleans up a voice session (stops listening for all users)
 */
export async function cleanupSession(guildId: string) {
  const voiceInteractionMgr = getVoiceInteractionManager();
  if (voiceInteractionMgr?.cleanup) {
    try {
      await voiceInteractionMgr.cleanup(guildId);
      log.info(`Stopped all voice listening in guild ${guildId}`);
    } catch (err) {
      log.warn(`Failed to cleanup voice listening: ${(err as Error).message}`);
    }
  }

  const connection = getVoiceConnection(guildId);
  if (connection) {
    connection.destroy();
    log.info(`Destroyed voice connection in guild ${guildId}`);
  }
}
