import { createLogger } from '../utils/logger';
import { VoiceStateManager } from './voiceStateManager';
import axios, { AxiosInstance } from 'axios';
import { v4 as uuidv4 } from 'uuid';

const log = createLogger('WORKER-COORDINATOR');

type BotType = 'rainbot' | 'pranjeet' | 'hungerbot';

interface WorkerConfig {
  baseUrl: string;
  timeout: number;
}

export class WorkerCoordinator {
  private workers: Map<BotType, AxiosInstance>;

  constructor(private voiceStateManager: VoiceStateManager) {
    this.workers = new Map();

    // Initialize worker clients
    const config: Record<BotType, WorkerConfig> = {
      rainbot: {
        baseUrl: process.env['RAINBOT_URL'] || 'http://localhost:3001',
        timeout: 500,
      },
      pranjeet: {
        baseUrl: process.env['PRANJEET_URL'] || 'http://localhost:3002',
        timeout: 500,
      },
      hungerbot: {
        baseUrl: process.env['HUNGERBOT_URL'] || 'http://localhost:3003',
        timeout: 500,
      },
    };

    for (const [botType, cfg] of Object.entries(config)) {
      this.workers.set(
        botType as BotType,
        axios.create({
          baseURL: cfg.baseUrl,
          timeout: cfg.timeout,
          headers: {
            'Content-Type': 'application/json',
          },
        })
      );
    }
  }

  /**
   * Ensure worker is connected to voice channel
   */
  async ensureWorkerConnected(
    botType: BotType,
    guildId: string,
    channelId: string
  ): Promise<{ success: boolean; error?: string }> {
    const requestId = uuidv4();
    const worker = this.workers.get(botType);

    if (!worker) {
      return { success: false, error: `Worker ${botType} not configured` };
    }

    try {
      // Check if already connected
      const statusResponse = await worker.get(`/status`, {
        params: { guildId },
      });

      if (statusResponse.data.connected && statusResponse.data.channelId === channelId) {
        log.debug(`${botType} already connected to channel ${channelId} in guild ${guildId}`);
        return { success: true };
      }

      // Join the channel
      const joinResponse = await worker.post('/join', {
        requestId,
        guildId,
        channelId,
      });

      if (
        joinResponse.data.status === 'joined' ||
        joinResponse.data.status === 'already_connected'
      ) {
        // Update worker status in Redis
        await this.voiceStateManager.setWorkerStatus(botType, guildId, channelId, true);
        log.info(`${botType} joined channel ${channelId} in guild ${guildId}`);
        return { success: true };
      }

      return { success: false, error: joinResponse.data.message };
    } catch (error: any) {
      log.error(`Failed to connect ${botType} to voice: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Disconnect worker from voice channel
   */
  async disconnectWorker(botType: BotType, guildId: string): Promise<void> {
    const requestId = uuidv4();
    const worker = this.workers.get(botType);

    if (!worker) {
      log.warn(`Worker ${botType} not configured`);
      return;
    }

    try {
      await worker.post('/leave', {
        requestId,
        guildId,
      });
      await this.voiceStateManager.setWorkerStatus(botType, guildId, '', false);
      log.info(`${botType} left voice in guild ${guildId}`);
    } catch (error: any) {
      log.error(`Failed to disconnect ${botType}: ${error.message}`);
    }
  }

  /**
   * Disconnect all workers from guild
   */
  async disconnectAllWorkers(guildId: string): Promise<void> {
    log.info(`Disconnecting all workers from guild ${guildId}`);
    await Promise.all([
      this.disconnectWorker('rainbot', guildId),
      this.disconnectWorker('pranjeet', guildId),
      this.disconnectWorker('hungerbot', guildId),
    ]);
    await this.voiceStateManager.clearActiveSession(guildId);
  }

  /**
   * Enqueue music track (Rainbot)
   */
  async enqueueTrack(
    guildId: string,
    url: string,
    requestedBy: string,
    requestedByUsername?: string
  ): Promise<{ success: boolean; message?: string; position?: number }> {
    const requestId = uuidv4();
    const worker = this.workers.get('rainbot');

    if (!worker) {
      return { success: false, message: 'Music worker not configured' };
    }

    try {
      const response = await worker.post('/enqueue', {
        requestId,
        guildId,
        url,
        requestedBy,
        requestedByUsername,
      });

      // Refresh session on activity
      await this.voiceStateManager.refreshSession(guildId);

      if (response.data.status === 'success') {
        return {
          success: true,
          message: response.data.message,
          position: response.data.position,
        };
      }

      return { success: false, message: response.data.message };
    } catch (error: any) {
      log.error(`Failed to enqueue track: ${error.message}`);
      return { success: false, message: error.message };
    }
  }

  /**
   * Speak TTS (Pranjeet)
   */
  async speakTTS(
    guildId: string,
    text: string,
    voice?: string,
    userId?: string
  ): Promise<{ success: boolean; message?: string }> {
    const requestId = uuidv4();
    const worker = this.workers.get('pranjeet');

    if (!worker) {
      return { success: false, message: 'TTS worker not configured' };
    }

    try {
      const response = await worker.post('/speak', {
        requestId,
        guildId,
        text,
        voice,
        userId,
      });

      // Refresh session on activity
      await this.voiceStateManager.refreshSession(guildId);

      if (response.data.status === 'success') {
        return { success: true, message: response.data.message };
      }

      return { success: false, message: response.data.message };
    } catch (error: any) {
      log.error(`Failed to speak TTS: ${error.message}`);
      return { success: false, message: error.message };
    }
  }

  /**
   * Play sound effect (HungerBot)
   */
  async playSound(
    guildId: string,
    userId: string,
    sfxId: string,
    volume?: number
  ): Promise<{ success: boolean; message?: string }> {
    const requestId = uuidv4();
    const worker = this.workers.get('hungerbot');

    if (!worker) {
      return { success: false, message: 'Soundboard worker not configured' };
    }

    try {
      const response = await worker.post('/play-sound', {
        requestId,
        guildId,
        userId,
        sfxId,
        volume,
      });

      // Refresh session on activity
      await this.voiceStateManager.refreshSession(guildId);

      if (response.data.status === 'success') {
        return { success: true, message: response.data.message };
      }

      return { success: false, message: response.data.message };
    } catch (error: any) {
      log.error(`Failed to play sound: ${error.message}`);
      return { success: false, message: error.message };
    }
  }

  /**
   * Set volume for worker
   */
  async setWorkerVolume(
    botType: BotType,
    guildId: string,
    volume: number
  ): Promise<{ success: boolean; message?: string }> {
    const requestId = uuidv4();
    const worker = this.workers.get(botType);

    if (!worker) {
      return { success: false, message: `Worker ${botType} not configured` };
    }

    try {
      const response = await worker.post('/volume', {
        requestId,
        guildId,
        volume,
      });

      if (response.data.status === 'success') {
        await this.voiceStateManager.setVolume(guildId, botType, volume);
        return { success: true };
      }

      return { success: false, message: response.data.message };
    } catch (error: any) {
      log.error(`Failed to set volume for ${botType}: ${error.message}`);
      return { success: false, message: error.message };
    }
  }

  /**
   * Get status for all workers in guild
   */
  async getWorkersStatus(guildId: string): Promise<Record<BotType, any>> {
    const statuses: Partial<Record<BotType, any>> = {};

    for (const [botType, worker] of this.workers.entries()) {
      try {
        const response = await worker.get('/status', {
          params: { guildId },
        });
        statuses[botType] = response.data;
      } catch (error) {
        statuses[botType] = { connected: false, error: 'Failed to get status' };
      }
    }

    return statuses as Record<BotType, any>;
  }
}
