import { createLogger } from '../utils/logger';
import { VoiceStateManager } from './voiceStateManager';
import axios, { AxiosInstance } from 'axios';
import { v4 as uuidv4 } from 'uuid';

const log = createLogger('WORKER-COORDINATOR');

type BotType = 'rainbot' | 'pranjeet' | 'hungerbot';
interface WorkerStatusResponse {
  connected: boolean;
  channelId?: string;
  playing?: boolean;
  nowPlaying?: string;
  volume?: number;
  queueLength?: number;
  activePlayers?: number;
  error?: string;
}

interface WorkerConfig {
  baseUrl: string;
  timeout: number;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Unknown error';
}

function normalizeWorkerStatus(data: unknown): WorkerStatusResponse {
  if (!data || typeof data !== 'object') {
    return { connected: false, error: 'Invalid status response' };
  }
  const record = data as Record<string, unknown>;
  const connected = typeof record['connected'] === 'boolean' ? record['connected'] : false;
  const channelId = typeof record['channelId'] === 'string' ? record['channelId'] : undefined;
  return {
    connected,
    channelId,
    playing: typeof record['playing'] === 'boolean' ? record['playing'] : undefined,
    nowPlaying: typeof record['nowPlaying'] === 'string' ? record['nowPlaying'] : undefined,
    volume: typeof record['volume'] === 'number' ? record['volume'] : undefined,
    queueLength: typeof record['queueLength'] === 'number' ? record['queueLength'] : undefined,
    activePlayers:
      typeof record['activePlayers'] === 'number' ? record['activePlayers'] : undefined,
    error: typeof record['error'] === 'string' ? record['error'] : undefined,
  };
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

    // Auto-follow is always enabled - workers join automatically when orchestrator joins
    log.info('Auto-follow enabled - workers will join voice automatically');
  }

  /**
   * Ensure worker is connected to voice channel.
   * Workers join automatically when orchestrator joins via VoiceStateUpdate,
   * so this just verifies connection status.
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

      // Workers should already be connected via auto-follow if orchestrator is
      // If not connected yet, give them a moment to catch up (async event processing)
      log.debug(`${botType} not yet connected, waiting for auto-follow...`);
      // Wait up to 2 seconds for auto-follow to kick in
      for (let i = 0; i < 4; i++) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        const retryStatus = await worker.get(`/status`, { params: { guildId } });
        if (retryStatus.data.connected && retryStatus.data.channelId === channelId) {
          log.debug(`${botType} connected via auto-follow`);
          await this.voiceStateManager.setWorkerStatus(botType, guildId, channelId, true);
          return { success: true };
        }
      }
      log.warn(`${botType} did not auto-follow, falling back to explicit join`);

      // Fallback: Join the channel explicitly
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
    } catch (error: unknown) {
      const message = getErrorMessage(error);
      log.error(`Failed to connect ${botType} to voice: ${message}`);
      return { success: false, error: message };
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
    } catch (error: unknown) {
      log.error(`Failed to disconnect ${botType}: ${getErrorMessage(error)}`);
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
    } catch (error: unknown) {
      const message = getErrorMessage(error);
      log.error(`Failed to enqueue track: ${message}`);
      return { success: false, message };
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
    } catch (error: unknown) {
      const message = getErrorMessage(error);
      log.error(`Failed to speak TTS: ${message}`);
      return { success: false, message };
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
    } catch (error: unknown) {
      const message = getErrorMessage(error);
      log.error(`Failed to play sound: ${message}`);
      return { success: false, message };
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
    } catch (error: unknown) {
      const message = getErrorMessage(error);
      log.error(`Failed to set volume for ${botType}: ${message}`);
      return { success: false, message };
    }
  }

  /**
   * Get status for all workers in guild
   */
  async getWorkersStatus(guildId: string): Promise<Record<BotType, WorkerStatusResponse>> {
    const statuses: Partial<Record<BotType, WorkerStatusResponse>> = {};

    for (const [botType, worker] of this.workers.entries()) {
      try {
        const response = await worker.get('/status', {
          params: { guildId },
        });
        statuses[botType] = normalizeWorkerStatus(response.data);
      } catch (_error) {
        statuses[botType] = { connected: false, error: 'Failed to get status' };
      }
    }

    return statuses as Record<BotType, WorkerStatusResponse>;
  }

  /**
   * Skip track(s) on Rainbot
   */
  async skipTrack(
    guildId: string,
    count: number = 1
  ): Promise<{ success: boolean; skipped?: string[]; message?: string }> {
    const requestId = uuidv4();
    const worker = this.workers.get('rainbot');

    if (!worker) {
      return { success: false, message: 'Music worker not configured' };
    }

    try {
      const response = await worker.post('/skip', {
        requestId,
        guildId,
        count,
      });

      if (response.data.status === 'success') {
        return { success: true, skipped: response.data.skipped };
      }

      return { success: false, message: response.data.message };
    } catch (error: unknown) {
      const message = getErrorMessage(error);
      log.error(`Failed to skip track: ${message}`);
      return { success: false, message };
    }
  }

  /**
   * Toggle pause on Rainbot
   */
  async togglePause(
    guildId: string
  ): Promise<{ success: boolean; paused?: boolean; message?: string }> {
    const requestId = uuidv4();
    const worker = this.workers.get('rainbot');

    if (!worker) {
      return { success: false, message: 'Music worker not configured' };
    }

    try {
      const response = await worker.post('/pause', {
        requestId,
        guildId,
      });

      if (response.data.status === 'success') {
        return { success: true, paused: response.data.paused };
      }

      return { success: false, message: response.data.message };
    } catch (error: unknown) {
      const message = getErrorMessage(error);
      log.error(`Failed to toggle pause: ${message}`);
      return { success: false, message };
    }
  }

  /**
   * Stop playback on Rainbot
   */
  async stopPlayback(guildId: string): Promise<{ success: boolean; message?: string }> {
    const requestId = uuidv4();
    const worker = this.workers.get('rainbot');

    if (!worker) {
      return { success: false, message: 'Music worker not configured' };
    }

    try {
      const response = await worker.post('/stop', {
        requestId,
        guildId,
      });

      if (response.data.status === 'success') {
        return { success: true };
      }

      return { success: false, message: response.data.message };
    } catch (error: unknown) {
      const message = getErrorMessage(error);
      log.error(`Failed to stop playback: ${message}`);
      return { success: false, message };
    }
  }

  /**
   * Clear queue on Rainbot
   */
  async clearQueue(
    guildId: string
  ): Promise<{ success: boolean; cleared?: number; message?: string }> {
    const requestId = uuidv4();
    const worker = this.workers.get('rainbot');

    if (!worker) {
      return { success: false, message: 'Music worker not configured' };
    }

    try {
      const response = await worker.post('/clear', {
        requestId,
        guildId,
      });

      if (response.data.status === 'success') {
        return { success: true, cleared: response.data.cleared };
      }

      return { success: false, message: response.data.message };
    } catch (error: unknown) {
      const message = getErrorMessage(error);
      log.error(`Failed to clear queue: ${message}`);
      return { success: false, message };
    }
  }

  /**
   * Get queue from Rainbot
   */
  async getQueue(guildId: string): Promise<{
    nowPlaying: string | null;
    queue: Array<{ title: string; url?: string }>;
    totalInQueue: number;
    currentTrack: { title: string; url?: string } | null;
    paused: boolean;
  }> {
    const worker = this.workers.get('rainbot');

    if (!worker) {
      return { nowPlaying: null, queue: [], totalInQueue: 0, currentTrack: null, paused: false };
    }

    try {
      const response = await worker.get('/queue', {
        params: { guildId },
      });

      return response.data;
    } catch (error: unknown) {
      log.error(`Failed to get queue: ${getErrorMessage(error)}`);
      return { nowPlaying: null, queue: [], totalInQueue: 0, currentTrack: null, paused: false };
    }
  }

  /**
   * Toggle autoplay on Rainbot
   */
  async toggleAutoplay(
    guildId: string,
    enabled?: boolean | null
  ): Promise<{ success: boolean; enabled?: boolean; message?: string }> {
    const requestId = uuidv4();
    const worker = this.workers.get('rainbot');

    if (!worker) {
      return { success: false, message: 'Music worker not configured' };
    }

    try {
      const response = await worker.post('/autoplay', {
        requestId,
        guildId,
        enabled,
      });

      if (response.data.status === 'success') {
        return { success: true, enabled: response.data.enabled };
      }

      return { success: false, message: response.data.message };
    } catch (error: unknown) {
      const message = getErrorMessage(error);
      log.error(`Failed to toggle autoplay: ${message}`);
      return { success: false, message };
    }
  }

  /**
   * Replay current/previous track on Rainbot
   */
  async replay(guildId: string): Promise<{ success: boolean; track?: string; message?: string }> {
    const requestId = uuidv4();
    const worker = this.workers.get('rainbot');

    if (!worker) {
      return { success: false, message: 'Music worker not configured' };
    }

    try {
      const response = await worker.post('/replay', {
        requestId,
        guildId,
      });

      if (response.data.status === 'success') {
        return { success: true, track: response.data.track };
      }

      return { success: false, message: response.data.message };
    } catch (error: unknown) {
      const message = getErrorMessage(error);
      log.error(`Failed to replay: ${message}`);
      return { success: false, message };
    }
  }
}
