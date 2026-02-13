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

  /**
   * Set voice interaction enabled state for guild
   */
  async setVoiceInteractionEnabled(guildId: string, enabled: boolean): Promise<void> {
    const key = `voice:interaction:enabled:${guildId}`;
    await this.redis.set(key, enabled ? '1' : '0');
    log.debug(`Set voice interaction enabled for guild ${guildId}: ${enabled}`);
  }

  /**
   * Get voice interaction enabled state for guild
   */
  async getVoiceInteractionEnabled(guildId: string): Promise<boolean> {
    const key = `voice:interaction:enabled:${guildId}`;
    const data = await this.redis.get(key);
    return data === '1'; // Default false if not set
  }

  /**
   * Set conversation mode (Grok chat) for a user in a guild.
   * When disabling, also clears the Grok response_id so the next session starts fresh.
   */
  async setConversationMode(guildId: string, userId: string, enabled: boolean): Promise<void> {
    const key = `conversation:${guildId}:${userId}`;
    if (enabled) {
      await this.redis.set(key, '1');
      log.debug(`Set conversation mode on for user ${userId} in guild ${guildId}`);
    } else {
      await this.redis.del(key);
      const grokResponseKey = `grok:response_id:${guildId}:${userId}`;
      const grokHistoryKey = `grok:history:${guildId}:${userId}`;
      await this.redis.del(grokResponseKey);
      await this.redis.del(grokHistoryKey);
      log.debug(`Set conversation mode off for user ${userId} in guild ${guildId}`);
    }
  }

  /**
   * Get conversation mode for a user in a guild
   */
  async getConversationMode(guildId: string, userId: string): Promise<boolean> {
    const key = `conversation:${guildId}:${userId}`;
    const data = await this.redis.get(key);
    return data === '1';
  }

  /** Valid xAI Voice Agent voices. */
  static readonly GROK_VOICES = ['Ara', 'Rex', 'Sal', 'Eve', 'Leo'] as const;

  /**
   * Get Grok Voice Agent voice preference for a user in a guild.
   * Returns null if not set (caller should use config default).
   */
  async getGrokVoice(guildId: string, userId: string): Promise<string | null> {
    const key = `grok:voice:${guildId}:${userId}`;
    return await this.redis.get(key);
  }

  /**
   * Set Grok Voice Agent voice preference for a user in a guild.
   * Voice must be one of: Ara, Rex, Sal, Eve, Leo.
   */
  async setGrokVoice(guildId: string, userId: string, voice: string): Promise<void> {
    const valid = VoiceStateManager.GROK_VOICES.includes(
      voice as (typeof VoiceStateManager.GROK_VOICES)[number]
    );
    if (!valid) {
      throw new Error(
        `Invalid Grok voice. Must be one of: ${VoiceStateManager.GROK_VOICES.join(', ')}`
      );
    }
    const key = `grok:voice:${guildId}:${userId}`;
    await this.redis.set(key, voice);
    log.debug(`Set Grok voice for user ${userId} in guild ${guildId}: ${voice}`);
  }

  /** Redis key for selected Grok persona per user per guild. */
  private static grokPersonaKey(guildId: string, userId: string): string {
    return `grok:persona:${guildId}:${userId}`;
  }

  /**
   * Get selected Grok persona id for a user in a guild.
   * Returns null if not set (caller uses default).
   */
  async getGrokPersona(guildId: string, userId: string): Promise<string | null> {
    return await this.redis.get(VoiceStateManager.grokPersonaKey(guildId, userId));
  }

  /**
   * Set selected Grok persona id for a user in a guild.
   * Use empty string to clear (revert to default).
   */
  async setGrokPersona(guildId: string, userId: string, personaId: string): Promise<void> {
    const key = VoiceStateManager.grokPersonaKey(guildId, userId);
    if (personaId.trim() === '') {
      await this.redis.del(key);
    } else {
      await this.redis.set(key, personaId.trim());
    }
    log.debug(
      `Set Grok persona for user ${userId} in guild ${guildId}: ${personaId.trim() || '(default)'}`
    );
  }

  /** Redis key for custom persona payload (so Pranjeet can resolve without DB). */
  private static customPersonaKey(id: string): string {
    return `persona:custom:${id}`;
  }

  /**
   * Write custom persona to Redis cache so Pranjeet can resolve it by id.
   */
  async setCustomPersonaCache(
    id: string,
    data: { id: string; name: string; systemPrompt: string }
  ): Promise<void> {
    const key = VoiceStateManager.customPersonaKey(id);
    await this.redis.set(key, JSON.stringify(data));
    log.debug(`Cached custom persona ${id} in Redis`);
  }

  /**
   * Remove custom persona from Redis cache (e.g. when deleted).
   */
  async deleteCustomPersonaCache(id: string): Promise<void> {
    await this.redis.del(VoiceStateManager.customPersonaKey(id));
    log.debug(`Removed custom persona cache ${id} from Redis`);
  }
}
