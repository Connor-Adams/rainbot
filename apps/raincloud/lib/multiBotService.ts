/**
 * Multi-Bot Service Singleton
 *
 * Provides a unified interface for commands and API routes to interact with
 * worker bots (Rainbot, Pranjeet, HungerBot) via the WorkerCoordinator.
 *
 * This replaces direct voiceManager usage for multi-bot architecture.
 */

import { WorkerCoordinator } from './workerCoordinator';
import { VoiceStateManager } from './voiceStateManager';
import { ChannelResolver } from './channelResolver';
import { RedisClient } from '@rainbot/redis-client';
import { createLogger } from '../utils/logger';
import { registerWorkerCoordinator } from './workerCoordinatorRegistry';
import * as voiceManager from '../utils/voiceManager';
import type { Client, VoiceBasedChannel } from 'discord.js';

const log = createLogger('MULTIBOT-SERVICE');

type BotType = 'rainbot' | 'pranjeet' | 'hungerbot';

export interface PlayResult {
  success: boolean;
  message?: string;
  position?: number;
  error?: string;
}

export interface VoiceStatus {
  channelId: string | null;
  channelName: string | null;
  isConnected: boolean;
  isPlaying: boolean;
  nowPlaying: string | null;
  volume: number;
  workers: {
    rainbot: { connected: boolean; playing?: boolean; queueLength?: number; volume?: number };
    pranjeet: { connected: boolean; playing?: boolean; volume?: number };
    hungerbot: { connected: boolean; playing?: boolean; activePlayers?: number; volume?: number };
  };
}

export interface QueueInfo {
  nowPlaying: string | null;
  queue: Array<{ title: string; url?: string; duration?: number }>;
  totalInQueue: number;
  currentTrack: { title: string; url?: string; duration?: number } | null;
  isPaused: boolean;
}

let instance: MultiBotService | null = null;

export class MultiBotService {
  private coordinator: WorkerCoordinator;
  private voiceStateManager: VoiceStateManager;
  private channelResolver: ChannelResolver;
  private discordClient: Client | null = null;

  private constructor(redisClient: RedisClient) {
    this.voiceStateManager = new VoiceStateManager(redisClient);
    this.coordinator = new WorkerCoordinator(this.voiceStateManager);
    registerWorkerCoordinator(this.coordinator);
    this.channelResolver = new ChannelResolver(this.voiceStateManager);
  }

  /**
   * Initialize the multi-bot service singleton
   */
  static async initialize(redisUrl?: string): Promise<MultiBotService> {
    if (instance) {
      return instance;
    }

    const redisClient = new RedisClient();
    await redisClient.connect(redisUrl || process.env['REDIS_URL'] || 'redis://localhost:6379');

    instance = new MultiBotService(redisClient);
    log.info('MultiBotService initialized');
    return instance;
  }

  /**
   * Get the singleton instance
   */
  static getInstance(): MultiBotService {
    if (!instance) {
      throw new Error('MultiBotService not initialized. Call initialize() first.');
    }
    return instance;
  }

  /**
   * Check if service is initialized
   */
  static isInitialized(): boolean {
    return instance !== null;
  }

  /**
   * Set Discord client reference (for channel resolution)
   */
  setDiscordClient(client: Client): void {
    this.discordClient = client;
    this.channelResolver.setClient(client);
  }

  /**
   * Join a voice channel with all workers
   */
  async joinChannel(
    channel: VoiceBasedChannel,
    userId: string
  ): Promise<{ success: boolean; message?: string }> {
    const guildId = channel.guild.id;
    const channelId = channel.id;

    log.info(`Joining channel ${channel.name} in guild ${guildId}`);

    try {
      // Update voice state tracking
      await this.voiceStateManager.setCurrentChannel(guildId, userId, channelId);
      await this.voiceStateManager.setLastChannel(guildId, userId, channelId);
      await this.voiceStateManager.setActiveSession(guildId, channelId);

      try {
        await voiceManager.joinChannel(channel);
        log.info(`Orchestrator joined channel ${channel.name}`);
      } catch (error) {
        log.warn(`Orchestrator failed to join channel: ${(error as Error).message}`);
      }

      // Connect all workers to the channel
      const results = await Promise.allSettled([
        this.coordinator.ensureWorkerConnected('rainbot', guildId, channelId),
        this.coordinator.ensureWorkerConnected('pranjeet', guildId, channelId),
        this.coordinator.ensureWorkerConnected('hungerbot', guildId, channelId),
      ]);

      // Check if at least Rainbot connected (primary music bot)
      const rainbotResult = results[0];
      if (rainbotResult.status === 'rejected' || !rainbotResult.value.success) {
        const error =
          rainbotResult.status === 'rejected'
            ? rainbotResult.reason.message
            : rainbotResult.value.error;
        log.error(`Failed to connect Rainbot: ${error}`);
        return { success: false, message: `Failed to connect music bot: ${error}` };
      }

      log.info(`Successfully joined channel ${channel.name}`);
      return { success: true, message: `Joined ${channel.name}` };
    } catch (error) {
      log.error(`Failed to join channel: ${(error as Error).message}`);
      return { success: false, message: (error as Error).message };
    }
  }

  /**
   * Leave voice channel with all workers
   */
  async leaveChannel(guildId: string): Promise<boolean> {
    log.info(`Leaving voice in guild ${guildId}`);

    try {
      await this.coordinator.disconnectAllWorkers(guildId);
      await this.voiceStateManager.clearActiveSession(guildId);
      voiceManager.leaveChannel(guildId);
      return true;
    } catch (error) {
      log.error(`Failed to leave channel: ${(error as Error).message}`);
      return false;
    }
  }

  /**
   * Play a track via Rainbot worker
   */
  async playSound(
    guildId: string,
    source: string,
    userId: string,
    _requestSource: string = 'discord',
    username?: string,
    _discriminator?: string
  ): Promise<PlayResult> {
    log.info(`Play request: "${source}" by ${username || userId} in guild ${guildId}`);

    try {
      // Resolve target channel
      const channelResult = await this.channelResolver.resolveTargetChannel(guildId, userId);

      if (channelResult.error) {
        return {
          success: false,
          error: channelResult.error,
          message: channelResult.message,
        };
      }

      if (!channelResult.channelId) {
        return {
          success: false,
          error: 'NO_CHANNEL',
          message: 'Please join a voice channel first.',
        };
      }

      // Ensure Rainbot is connected
      const connectResult = await this.coordinator.ensureWorkerConnected(
        'rainbot',
        guildId,
        channelResult.channelId
      );

      if (!connectResult.success) {
        return {
          success: false,
          error: 'CONNECTION_FAILED',
          message: connectResult.error || 'Failed to connect to voice channel',
        };
      }

      // Enqueue track via Rainbot
      const result = await this.coordinator.enqueueTrack(guildId, source, userId, username);

      return {
        success: result.success,
        message: result.message,
        position: result.position,
        error: result.success ? undefined : result.message,
      };
    } catch (error) {
      log.error(`Play failed: ${(error as Error).message}`);
      return {
        success: false,
        error: 'PLAY_ERROR',
        message: (error as Error).message,
      };
    }
  }

  /**
   * Speak TTS via Pranjeet worker
   */
  async speakTTS(
    guildId: string,
    text: string,
    userId: string,
    voice?: string
  ): Promise<{ success: boolean; message?: string }> {
    log.info(`TTS request: "${text.substring(0, 50)}..." in guild ${guildId}`);

    try {
      // Resolve target channel
      const channelResult = await this.channelResolver.resolveTargetChannel(guildId, userId);

      if (channelResult.error || !channelResult.channelId) {
        return {
          success: false,
          message: channelResult.message || 'Please join a voice channel first.',
        };
      }

      // Ensure Pranjeet is connected
      await this.coordinator.ensureWorkerConnected('pranjeet', guildId, channelResult.channelId);

      // Send TTS request
      return await this.coordinator.speakTTS(guildId, text, voice, userId);
    } catch (error) {
      log.error(`TTS failed: ${(error as Error).message}`);
      return { success: false, message: (error as Error).message };
    }
  }

  /**
   * Play soundboard effect via HungerBot worker
   */
  async playSoundboard(
    guildId: string,
    userId: string,
    sfxId: string,
    volume?: number
  ): Promise<{ success: boolean; message?: string }> {
    log.info(`Soundboard request: "${sfxId}" by ${userId} in guild ${guildId}`);

    try {
      // Resolve target channel
      const channelResult = await this.channelResolver.resolveTargetChannel(guildId, userId);

      if (channelResult.error || !channelResult.channelId) {
        return {
          success: false,
          message: channelResult.message || 'Please join a voice channel first.',
        };
      }

      // Ensure HungerBot is connected
      await this.coordinator.ensureWorkerConnected('hungerbot', guildId, channelResult.channelId);

      // Play sound
      return await this.coordinator.playSound(guildId, userId, sfxId, volume);
    } catch (error) {
      log.error(`Soundboard failed: ${(error as Error).message}`);
      return { success: false, message: (error as Error).message };
    }
  }

  /**
   * Set volume for a specific worker
   */
  async setVolume(
    guildId: string,
    volume: number,
    botType: BotType = 'rainbot'
  ): Promise<{ success: boolean; message?: string }> {
    // Convert 1-100 to 0-1 if needed
    const normalizedVolume = volume > 1 ? volume / 100 : volume;
    return await this.coordinator.setWorkerVolume(botType, guildId, normalizedVolume);
  }

  /**
   * Get status for all workers in a guild
   */
  async getStatus(guildId: string): Promise<VoiceStatus | null> {
    try {
      const session = await this.voiceStateManager.getActiveSession(guildId);
      const workerStatuses = await this.coordinator.getWorkersStatus(guildId);

      if (!session) {
        return null;
      }

      // Get channel name from Discord if client is available
      let channelName: string | null = null;
      if (this.discordClient && session.channelId) {
        try {
          const guild = await this.discordClient.guilds.fetch(guildId);
          const channel = await guild.channels.fetch(session.channelId);
          channelName = channel?.name || null;
        } catch {
          // Ignore channel fetch errors
        }
      }

      // Extract playback info from rainbot worker status
      const rainbotStatus = workerStatuses.rainbot || {};
      const isPlaying = rainbotStatus.playing || false;
      const nowPlaying = rainbotStatus.nowPlaying || null;
      const volume = rainbotStatus.volume ?? 100;

      return {
        channelId: session.channelId,
        channelName,
        isConnected: rainbotStatus.connected || false,
        isPlaying,
        nowPlaying,
        volume,
        workers: {
          rainbot: {
            connected: rainbotStatus.connected || false,
            playing: isPlaying,
            queueLength: rainbotStatus.queueLength || 0,
            volume: rainbotStatus.volume,
          },
          pranjeet: {
            connected: workerStatuses.pranjeet?.connected || false,
            playing: workerStatuses.pranjeet?.playing || false,
            volume: workerStatuses.pranjeet?.volume,
          },
          hungerbot: {
            connected: workerStatuses.hungerbot?.connected || false,
            playing: workerStatuses.hungerbot?.playing || false,
            activePlayers: workerStatuses.hungerbot?.activePlayers || 0,
            volume: workerStatuses.hungerbot?.volume,
          },
        },
      };
    } catch (error) {
      log.error(`Failed to get status: ${(error as Error).message}`);
      return null;
    }
  }

  /**
   * Get queue info from Rainbot
   */
  async getQueue(guildId: string): Promise<QueueInfo> {
    try {
      const queueData = await this.coordinator.getQueue(guildId);
      return {
        nowPlaying: queueData.nowPlaying,
        queue: queueData.queue,
        totalInQueue: queueData.totalInQueue,
        currentTrack: queueData.currentTrack,
        isPaused: queueData.paused,
      };
    } catch {
      return {
        nowPlaying: null,
        queue: [],
        totalInQueue: 0,
        currentTrack: null,
        isPaused: false,
      };
    }
  }

  /**
   * Skip current track (Rainbot)
   */
  async skip(guildId: string, count: number = 1): Promise<string[]> {
    try {
      const result = await this.coordinator.skipTrack(guildId, count);
      return result.success ? result.skipped || [] : [];
    } catch (error) {
      log.error(`Skip failed: ${(error as Error).message}`);
      return [];
    }
  }

  /**
   * Toggle pause (Rainbot)
   */
  async togglePause(guildId: string): Promise<{ paused: boolean }> {
    try {
      const result = await this.coordinator.togglePause(guildId);
      return { paused: result.paused ?? false };
    } catch (error) {
      log.error(`Toggle pause failed: ${(error as Error).message}`);
      return { paused: false };
    }
  }

  /**
   * Stop playback (Rainbot)
   */
  async stop(guildId: string): Promise<boolean> {
    try {
      const result = await this.coordinator.stopPlayback(guildId);
      return result.success;
    } catch (error) {
      log.error(`Stop failed: ${(error as Error).message}`);
      return false;
    }
  }

  /**
   * Clear queue (Rainbot)
   */
  async clearQueue(
    guildId: string
  ): Promise<{ success: boolean; cleared?: number; message?: string }> {
    try {
      const result = await this.coordinator.clearQueue(guildId);
      return { success: result.success, cleared: result.cleared, message: result.message };
    } catch (error) {
      log.error(`Clear queue failed: ${(error as Error).message}`);
      return { success: false, message: (error as Error).message };
    }
  }

  /**
   * Get queue info (alias for getQueue with normalized response)
   */
  async getQueueInfo(
    guildId: string
  ): Promise<{ success: boolean; queue?: QueueInfo; message?: string }> {
    try {
      const queue = await this.getQueue(guildId);
      return { success: true, queue };
    } catch (error) {
      log.error(`Get queue info failed: ${(error as Error).message}`);
      return { success: false, message: (error as Error).message };
    }
  }

  /**
   * Toggle autoplay mode (Rainbot)
   */
  async toggleAutoplay(
    guildId: string,
    enabled?: boolean | null
  ): Promise<{ success: boolean; enabled?: boolean; message?: string }> {
    try {
      const result = await this.coordinator.toggleAutoplay(guildId, enabled);
      return { success: result.success, enabled: result.enabled, message: result.message };
    } catch (error) {
      log.error(`Toggle autoplay failed: ${(error as Error).message}`);
      return { success: false, message: (error as Error).message };
    }
  }

  /**
   * Replay current/previous track (Rainbot)
   */
  async replay(guildId: string): Promise<{ success: boolean; track?: string; message?: string }> {
    try {
      const result = await this.coordinator.replay(guildId);
      return { success: result.success, track: result.track, message: result.message };
    } catch (error) {
      log.error(`Replay failed: ${(error as Error).message}`);
      return { success: false, message: (error as Error).message };
    }
  }

  // Expose coordinator for advanced usage
  getCoordinator(): WorkerCoordinator {
    return this.coordinator;
  }

  getVoiceStateManager(): VoiceStateManager {
    return this.voiceStateManager;
  }

  getChannelResolver(): ChannelResolver {
    return this.channelResolver;
  }
}

// Export singleton getter for convenient access
export function getMultiBotService(): MultiBotService {
  return MultiBotService.getInstance();
}

export default MultiBotService;
