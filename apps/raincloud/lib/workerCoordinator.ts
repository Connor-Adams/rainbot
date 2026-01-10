// ...existing code...

import { createLogger } from '../utils/logger.ts';
import { VoiceStateManager } from './voiceStateManager.ts';
import axios, { AxiosInstance } from 'axios';
import { v4 as uuidv4 } from 'uuid';

const log = createLogger('WORKER-COORDINATOR');

type BotType = 'rainbot' | 'pranjeet' | 'hungerbot';

interface WorkerConfig {
  baseUrl: string;
  timeout: number;
}

function getErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    return (
      (error.response?.data as { message?: string })?.message ||
      error.response?.statusText ||
      error.message
    );
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'Unknown error';
}

export class WorkerCoordinator {
  // Rainbot worker API methods (signatures for type safety)
  public getQueue!: (guildId: string) => Promise<any>;
  public skipTrack!: (guildId: string, count?: number) => Promise<any>;
  public togglePause!: (guildId: string) => Promise<any>;
  public stopPlayback!: (guildId: string) => Promise<any>;
  public clearQueue!: (guildId: string) => Promise<any>;
  public toggleAutoplay!: (guildId: string, enabled?: boolean | null) => Promise<any>;
  public replay!: (guildId: string) => Promise<any>;
  private workers: Map<BotType, AxiosInstance>;

  constructor(private voiceStateManager: VoiceStateManager) {
    this.workers = new Map();

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
          headers: { 'Content-Type': 'application/json' },
        })
      );
    }

    log.info('Auto-follow enabled - workers will join voice automatically');
  }

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
      const statusResponse = await worker.get('/status', { params: { guildId } });

      if (statusResponse.data.connected && statusResponse.data.channelId === channelId) {
        return { success: true };
      }

      for (let i = 0; i < 4; i++) {
        await new Promise((r) => setTimeout(r, 500));
        const retry = await worker.get('/status', { params: { guildId } });
        if (retry.data.connected && retry.data.channelId === channelId) {
          await this.voiceStateManager.setWorkerStatus(botType, guildId, channelId, true);
          return { success: true };
        }
      }

      const joinResponse = await worker.post('/join', {
        requestId,
        guildId,
        channelId,
      });

      if (
        joinResponse.data.status === 'joined' ||
        joinResponse.data.status === 'already_connected'
      ) {
        await this.voiceStateManager.setWorkerStatus(botType, guildId, channelId, true);
        return { success: true };
      }

      return { success: false, error: joinResponse.data.message };
    } catch (error: unknown) {
      const message = getErrorMessage(error);
      log.error(`Failed to connect ${botType}: ${message}`);
      return { success: false, error: message };
    }
  }

  async disconnectWorker(botType: BotType, guildId: string): Promise<void> {
    const worker = this.workers.get(botType);
    if (!worker) return;

    try {
      await worker.post('/leave', { requestId: uuidv4(), guildId });
      await this.voiceStateManager.setWorkerStatus(botType, guildId, '', false);
    } catch (error: unknown) {
      log.error(`Failed to disconnect ${botType}: ${getErrorMessage(error)}`);
    }
  }

  async disconnectAllWorkers(guildId: string): Promise<void> {
    await Promise.all([
      this.disconnectWorker('rainbot', guildId),
      this.disconnectWorker('pranjeet', guildId),
      this.disconnectWorker('hungerbot', guildId),
    ]);
    await this.voiceStateManager.clearActiveSession(guildId);
  }

  async enqueueTrack(
    guildId: string,
    url: string,
    requestedBy: string,
    requestedByUsername?: string
  ): Promise<{ success: boolean; message?: string; position?: number }> {
    const worker = this.workers.get('rainbot');
    if (!worker) return { success: false, message: 'Music worker not configured' };

    try {
      const res = await worker.post('/enqueue', {
        requestId: uuidv4(),
        guildId,
        url,
        requestedBy,
        requestedByUsername,
      });

      await this.voiceStateManager.refreshSession(guildId);

      if (res.data.status === 'success') {
        return {
          success: true,
          message: res.data.message,
          position: res.data.position,
        };
      }

      return { success: false, message: res.data.message };
    } catch (error: unknown) {
      return { success: false, message: getErrorMessage(error) };
    }
  }

  async speakTTS(
    guildId: string,
    text: string,
    voice?: string,
    userId?: string
  ): Promise<{ success: boolean; message?: string }> {
    const worker = this.workers.get('pranjeet');
    if (!worker) return { success: false, message: 'TTS worker not configured' };

    try {
      const res = await worker.post('/speak', {
        requestId: uuidv4(),
        guildId,
        text,
        voice,
        userId,
      });

      await this.voiceStateManager.refreshSession(guildId);

      return res.data.status === 'success'
        ? { success: true, message: res.data.message }
        : { success: false, message: res.data.message };
    } catch (error: unknown) {
      return { success: false, message: getErrorMessage(error) };
    }
  }

  async playSound(
    guildId: string,
    userId: string,
    sfxId: string,
    volume?: number
  ): Promise<{ success: boolean; message?: string }> {
    const worker = this.workers.get('hungerbot');
    if (!worker) return { success: false, message: 'Sound worker not configured' };

    try {
      const res = await worker.post('/play-sound', {
        requestId: uuidv4(),
        guildId,
        userId,
        sfxId,
        volume,
      });

      await this.voiceStateManager.refreshSession(guildId);

      return res.data.status === 'success'
        ? { success: true, message: res.data.message }
        : { success: false, message: res.data.message };
    } catch (error: unknown) {
      return { success: false, message: getErrorMessage(error) };
    }
  }

  async setWorkerVolume(
    botType: BotType,
    guildId: string,
    volume: number
  ): Promise<{ success: boolean; message?: string }> {
    const worker = this.workers.get(botType);
    if (!worker) return { success: false };

    try {
      const res = await worker.post('/volume', {
        requestId: uuidv4(),
        guildId,
        volume,
      });

      if (res.data.status === 'success') {
        await this.voiceStateManager.setVolume(guildId, botType, volume);
        return { success: true };
      }

      return { success: false, message: res.data.message };
    } catch (error: unknown) {
      return { success: false, message: getErrorMessage(error) };
    }
  }

  async getWorkersStatus(guildId: string): Promise<Record<BotType, unknown>> {
    const result: Partial<Record<BotType, unknown>> = {};

    for (const [botType, worker] of this.workers.entries()) {
      try {
        const res = await worker.get('/status', { params: { guildId } });
        result[botType] = res.data;
      } catch (error: unknown) {
        result[botType] = {
          connected: false,
          error: getErrorMessage(error),
        };
      }
    }

    return result as Record<BotType, unknown>;
  }
}
