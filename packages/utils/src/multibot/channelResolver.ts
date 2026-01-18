import { Client, PermissionFlagsBits } from 'discord.js';
import { VoiceStateManager } from './voiceStateManager';
import { createLogger } from '../logger';

const log = createLogger('CHANNEL-RESOLVER');

export interface ChannelResult {
  channelId?: string;
  error?: string;
  message?: string;
  activeChannelId?: string;
}

export class ChannelResolver {
  private client: Client | null = null;

  constructor(
    private voiceStateManager: VoiceStateManager,
    client?: Client
  ) {
    if (client) {
      this.client = client;
    }
  }

  /**
   * Set the Discord client (can be called after construction)
   */
  setClient(client: Client): void {
    this.client = client;
  }

  /**
   * Resolve target voice channel based on rules:
   * 1. User's current voice channel
   * 2. If not in voice, check for active session (reject if exists)
   * 3. Fall back to last used channel
   * 4. No valid channel
   */
  async resolveTargetChannel(guildId: string, userId: string): Promise<ChannelResult> {
    // 1. Check if user is currently in voice
    const currentChannel = await this.voiceStateManager.getCurrentChannel(guildId, userId);
    if (currentChannel) {
      log.debug(`User ${userId} in voice channel ${currentChannel}`);
      return { channelId: currentChannel };
    }

    // 2. Check for active session in different channel
    const activeSession = await this.voiceStateManager.getActiveSession(guildId);
    if (activeSession) {
      log.debug(
        `Session active in guild ${guildId}, channel ${activeSession.channelId}, using active session for user ${userId}`
      );
      return {
        channelId: activeSession.channelId,
        activeChannelId: activeSession.channelId,
      };
    }

    // 3. Fall back to last used channel
    const lastChannel = await this.voiceStateManager.getLastChannel(guildId, userId);
    if (lastChannel) {
      // Check permissions before returning
      const canJoin = await this.checkPermissions(guildId, lastChannel);
      if (canJoin) {
        log.debug(`Using last channel ${lastChannel} for user ${userId}`);
        return { channelId: lastChannel };
      } else {
        log.warn(`No permissions for last channel ${lastChannel} in guild ${guildId}`);
      }
    }

    // 4. No valid channel found
    return {
      error: 'NO_CHANNEL',
      message: 'Please join a voice channel first.',
    };
  }

  /**
   * Check if bot has permissions to connect and speak in channel
   */
  private async checkPermissions(guildId: string, channelId: string): Promise<boolean> {
    if (!this.client) {
      log.warn('Discord client not set, skipping permission check');
      return true; // Assume permissions are OK if client not available
    }

    try {
      const guild = this.client.guilds.cache.get(guildId);
      if (!guild) {
        log.error(`Guild ${guildId} not found`);
        return false;
      }

      const channel = guild.channels.cache.get(channelId);
      if (!channel || !channel.isVoiceBased()) {
        log.error(`Voice channel ${channelId} not found in guild ${guildId}`);
        return false;
      }

      const permissions = channel.permissionsFor(this.client.user!);
      if (!permissions) {
        log.error(`Could not get permissions for channel ${channelId}`);
        return false;
      }

      const hasConnect = permissions.has(PermissionFlagsBits.Connect);
      const hasSpeak = permissions.has(PermissionFlagsBits.Speak);

      if (!hasConnect || !hasSpeak) {
        log.warn(
          `Missing permissions in channel ${channelId}: Connect=${hasConnect}, Speak=${hasSpeak}`
        );
        return false;
      }

      return true;
    } catch (error) {
      log.error(`Permission check failed for channel ${channelId}: ${error}`);
      return false;
    }
  }

  /**
   * Get permission diagnostic for channel
   */
  async getPermissionDiagnostic(guildId: string, channelId: string): Promise<string> {
    if (!this.client) {
      return 'Discord client not set';
    }

    try {
      const guild = this.client.guilds.cache.get(guildId);
      if (!guild) return 'Guild not found';

      const channel = guild.channels.cache.get(channelId);
      if (!channel || !channel.isVoiceBased()) return 'Voice channel not found';

      const permissions = channel.permissionsFor(this.client.user!);
      if (!permissions) return 'Could not check permissions';

      const missing: string[] = [];
      if (!permissions.has(PermissionFlagsBits.Connect)) missing.push('Connect');
      if (!permissions.has(PermissionFlagsBits.Speak)) missing.push('Speak');

      if (missing.length === 0) {
        return 'All required permissions granted';
      }

      return `Missing permissions: ${missing.join(', ')}`;
    } catch (error) {
      return `Error checking permissions: ${error}`;
    }
  }
}
