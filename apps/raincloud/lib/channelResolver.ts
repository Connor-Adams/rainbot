import { Client, PermissionFlagsBits } from 'discord.js';
import { VoiceStateManager } from './voiceStateManager';
import { createLogger } from '@rainbot/utils/logger';

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
   * Read the user's voice channel from Discord's own cache.
   *
   * This is the authoritative answer and needs no event bookkeeping: under the
   * GuildVoiceStates intent discord.js populates `guild.voiceStates` from
   * GUILD_CREATE at startup and keeps it current from VOICE_STATE_UPDATE.
   *
   * Returns the channel id, `null` when Discord says the user is in no voice
   * channel, or `undefined` when we cannot tell (no client, guild uncached).
   */
  private getLiveVoiceChannel(guildId: string, userId: string): string | null | undefined {
    if (!this.client) return undefined;

    const guild = this.client.guilds.cache.get(guildId);
    if (!guild) return undefined;

    return guild.voiceStates.cache.get(userId)?.channelId ?? null;
  }

  /**
   * Cache the live channel in Redis so the session/last-channel fallbacks below
   * stay useful. Best-effort: a Redis failure must not fail the resolution.
   */
  private async cacheLiveChannel(
    guildId: string,
    userId: string,
    channelId: string
  ): Promise<void> {
    try {
      await this.voiceStateManager.setCurrentChannel(guildId, userId, channelId);
      await this.voiceStateManager.setLastChannel(guildId, userId, channelId);
    } catch (error) {
      log.warn(`Failed to cache live voice channel for user ${userId}: ${error}`);
    }
  }

  /**
   * Resolve target voice channel based on rules:
   * 1. User's current voice channel per Discord (Redis only when Discord can't say)
   * 2. If not in voice, check for active session (reject if exists)
   * 3. Fall back to last used channel
   * 4. No valid channel
   */
  async resolveTargetChannel(guildId: string, userId: string): Promise<ChannelResult> {
    // 1. Check if user is currently in voice. Discord's cache wins over Redis:
    // the Redis keys are only written by joinChannel and the voiceStateUpdate
    // handler, so for any user who never triggered a join they are empty, and
    // they can also be stale after a restart or a missed gateway event.
    const liveChannel = this.getLiveVoiceChannel(guildId, userId);
    if (liveChannel) {
      log.debug(`User ${userId} in voice channel ${liveChannel} (live Discord state)`);
      await this.cacheLiveChannel(guildId, userId, liveChannel);
      return { channelId: liveChannel };
    }

    if (liveChannel === undefined) {
      // Discord state unavailable — fall back to whatever Redis last recorded.
      const currentChannel = await this.voiceStateManager.getCurrentChannel(guildId, userId);
      if (currentChannel) {
        log.debug(`User ${userId} in voice channel ${currentChannel} (cached)`);
        return { channelId: currentChannel };
      }
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
