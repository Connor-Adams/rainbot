import { RedisClient } from '@rainbot/redis-client';
import { createLogger } from '@utils/logger';

const log = createLogger('VOICE-STATE');

export class VoiceStateManager {
  constructor(private redis: RedisClient) {}

  /**
   * Set user's current voice channel (cleared when they leave)
   */
  async setCurrentChannel(
    guildId: string,
    userId: string,
    channelId: string | null
  ): Promise<void> {
    const key = `voice:current:${guildId}:${userId}`;
    if (channelId) {
      await this.redis.set(key, channelId);
      log.debug(`Set current channel for user ${userId} in guild ${guildId}: ${channelId}`);
    } else {
      await this.redis.del(key);
      log.debug(`Cleared current channel for user ${userId} in guild ${guildId}`);
    }
  }

  /**
   * Get user's current voice channel
   */
  async getCurrentChannel(guildId: string, userId: string): Promise<string | null> {
    const key = `voice:current:${guildId}:${userId}`;
    return await this.redis.get(key);
  }

  /**
   * Set user's last used channel (persists)
   */
  async setLastChannel(guildId: string, userId: string, channelId: string): Promise<void> {
    const key = `voice:last:${guildId}:${userId}`;
    await this.redis.set(key, channelId);
    log.debug(`Set last channel for user ${userId} in guild ${guildId}: ${channelId}`);
  }

  /**
   * Get user's last used channel
   */
  async getLastChannel(guildId: string, userId: string): Promise<string | null> {
    const key = `voice:last:${guildId}:${userId}`;
    return await this.redis.get(key);
  }

  /**
   * Set active session for guild (30 min TTL)
   */
  async setActiveSession(guildId: string, channelId: string): Promise<void> {
    const key = `session:${guildId}`;
    const data = JSON.stringify({
      channelId,
      timestamp: Date.now(),
    });
    await this.redis.set(key, data, 1800); // 30 minutes
    log.debug(`Set active session in guild ${guildId}: channel ${channelId}`);
  }

  /**
   * Get active session for guild
   */
  async getActiveSession(guildId: string): Promise<{ channelId: string } | null> {
    const key = `session:${guildId}`;
    const data = await this.redis.get(key);
    if (!data) return null;

    try {
      return JSON.parse(data);
    } catch (error) {
      log.error(`Failed to parse session data: ${error}`);
      return null;
    }
  }

  /**
   * Clear active session
   */
  async clearActiveSession(guildId: string): Promise<void> {
    const key = `session:${guildId}`;
    await this.redis.del(key);
    log.debug(`Cleared active session in guild ${guildId}`);
  }

  /**
   * Refresh session TTL (on activity)
   */
  async refreshSession(guildId: string): Promise<void> {
    const key = `session:${guildId}`;
    const exists = await this.redis.exists(key);
    if (exists) {
      await this.redis.expire(key, 1800); // Reset to 30 minutes
      log.debug(`Refreshed session TTL in guild ${guildId}`);
    }
  }

  /**
   * Set worker status
   */
  async setWorkerStatus(
    botType: string,
    guildId: string,
    channelId: string,
    connected: boolean
  ): Promise<void> {
    const key = `worker:${botType}:${guildId}`;
    const data = JSON.stringify({
      channelId,
      connected,
      lastHeartbeat: Date.now(),
    });
    await this.redis.set(key, data);
  }

  /**
   * Get worker status
   */
  async getWorkerStatus(
    botType: string,
    guildId: string
  ): Promise<{ channelId: string; connected: boolean; lastHeartbeat: number } | null> {
    const key = `worker:${botType}:${guildId}`;
    const data = await this.redis.get(key);
    if (!data) return null;

    try {
      const parsed = JSON.parse(data) as {
        channelId?: unknown;
        connected?: unknown;
        lastHeartbeat?: unknown;
      };
      if (typeof parsed.channelId !== 'string' || typeof parsed.connected !== 'boolean') {
        return null;
      }
      return {
        channelId: parsed.channelId,
        connected: parsed.connected,
        lastHeartbeat: typeof parsed.lastHeartbeat === 'number' ? parsed.lastHeartbeat : 0,
      };
    } catch (_error) {
      return null;
    }
  }

  /**
   * Set volume for bot type in guild
   */
  async setVolume(guildId: string, botType: string, volume: number): Promise<void> {
    const key = `volume:${guildId}:${botType}`;
    await this.redis.set(key, volume.toString());
  }

  /**
   * Get volume for bot type in guild
   */
  async getVolume(guildId: string, botType: string): Promise<number> {
    const key = `volume:${guildId}:${botType}`;
    const data = await this.redis.get(key);
    return data ? parseFloat(data) : 0.5; // Default 50%
  }
}
