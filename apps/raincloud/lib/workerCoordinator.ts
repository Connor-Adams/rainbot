import { createLogger } from '@utils/logger';
import { VoiceStateManager } from './voiceStateManager';
import axios, { AxiosInstance } from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { fetchWorkerHealthChecks } from '../src/rpc/clients';

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

interface WorkerHealth {
  ready: boolean;
  lastChecked: number;
  lastError?: string;
}

interface CircuitState {
  failureCount: number;
  openedUntil: number;
  lastFailure?: number;
}

const CIRCUIT_FAILURE_THRESHOLD = 3;
const CIRCUIT_OPEN_MS = 30_000;
const HEALTH_POLL_MS = 15_000;
const RETRY_MAX = 2;
const RETRY_BASE_MS = 150;
const TTS_QUEUE_NAME = 'tts';
const DEFAULT_WORKER_PORT =
  process.env['RAILWAY_ENVIRONMENT'] || process.env['RAILWAY_PUBLIC_DOMAIN'] ? 8080 : 3000;

function normalizeWorkerUrl(rawUrl: string): string {
  const withScheme = rawUrl.match(/^https?:\/\//) ? rawUrl : `http://${rawUrl}`;
  const trimmed = withScheme.replace(/\/$/, '');
  if (trimmed.match(/:\d+$/)) {
    return trimmed;
  }
  return `${trimmed}:${DEFAULT_WORKER_PORT}`;
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class WorkerCoordinator {
  private workers: Map<BotType, AxiosInstance>;
  private circuit: Map<BotType, CircuitState>;
  private health: Map<BotType, WorkerHealth>;
  private ttsQueue: Queue | null;

  constructor(private voiceStateManager: VoiceStateManager) {
    this.workers = new Map();
    this.circuit = new Map();
    this.health = new Map();
    this.ttsQueue = null;

    // Initialize worker clients
    const config: Record<BotType, WorkerConfig> = {
      rainbot: {
        baseUrl: normalizeWorkerUrl(process.env['RAINBOT_URL'] || 'http://localhost:3001'),
        timeout: 500,
      },
      pranjeet: {
        baseUrl: normalizeWorkerUrl(process.env['PRANJEET_URL'] || 'http://localhost:3002'),
        timeout: 500,
      },
      hungerbot: {
        baseUrl: normalizeWorkerUrl(process.env['HUNGERBOT_URL'] || 'http://localhost:3003'),
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
      this.circuit.set(botType as BotType, { failureCount: 0, openedUntil: 0 });
      this.health.set(botType as BotType, { ready: true, lastChecked: 0 });
    }

    // Auto-follow is always enabled - workers join automatically when orchestrator joins
    log.info('Auto-follow enabled - workers will join voice automatically');

    const redisUrl = process.env['REDIS_URL'];
    if (redisUrl) {
      try {
        const connection = new IORedis(redisUrl, {
          maxRetriesPerRequest: null,
        });
        this.ttsQueue = new Queue(TTS_QUEUE_NAME, { connection });
        log.info('TTS queue enabled');
      } catch (error) {
        log.warn(`Failed to initialize TTS queue: ${getErrorMessage(error)}`);
        this.ttsQueue = null;
      }
    } else {
      log.info('TTS queue disabled (REDIS_URL not configured)');
    }

    this.startHealthPolling();
  }

  private startHealthPolling(): void {
    const poll = async (): Promise<void> => {
      const rpcResults = await fetchWorkerHealthChecks().catch((error) => {
        log.warn(`RPC health checks failed: ${getErrorMessage(error)}`);
        return null;
      });

      for (const [botType, worker] of this.workers.entries()) {
        const rpcResult = rpcResults?.[botType];
        if (rpcResult && rpcResult.status === 'fulfilled') {
          this.health.set(botType, { ready: true, lastChecked: Date.now() });
          continue;
        }

        try {
          await this.requestWithRetry(botType, () => worker.get('/health/ready'), true);
          this.health.set(botType, { ready: true, lastChecked: Date.now() });
        } catch (error) {
          const rpcMessage =
            rpcResult && rpcResult.status === 'rejected'
              ? getErrorMessage(rpcResult.reason)
              : undefined;
          const message = rpcMessage || getErrorMessage(error);
          this.health.set(botType, { ready: false, lastChecked: Date.now(), lastError: message });
          log.warn(`${botType} health check failed: ${message}`);
        }
      }
    };

    poll().catch(() => {});
    setInterval(() => {
      poll().catch(() => {});
    }, HEALTH_POLL_MS);
  }

  private isCircuitOpen(botType: BotType): boolean {
    const state = this.circuit.get(botType);
    if (!state) return false;
    return state.openedUntil > Date.now();
  }

  private recordSuccess(botType: BotType): void {
    const state = this.circuit.get(botType);
    if (!state) return;
    state.failureCount = 0;
    state.openedUntil = 0;
  }

  private recordFailure(botType: BotType): void {
    const state = this.circuit.get(botType);
    if (!state) return;
    state.failureCount += 1;
    state.lastFailure = Date.now();
    if (state.failureCount >= CIRCUIT_FAILURE_THRESHOLD) {
      state.openedUntil = Date.now() + CIRCUIT_OPEN_MS;
    }
  }

  private isWorkerReady(botType: BotType): boolean {
    const health = this.health.get(botType);
    if (!health) return true;
    return health.ready;
  }

  markWorkerReady(botType: BotType, meta?: { instanceId?: string; startedAt?: string }): void {
    this.health.set(botType, { ready: true, lastChecked: Date.now() });
    if (meta?.instanceId) {
      log.info(`${botType} registered (instance=${meta.instanceId})`);
    } else {
      log.info(`${botType} registered`);
    }
  }

  private guardWorker(botType: BotType): { ok: boolean; error?: string } {
    if (this.isCircuitOpen(botType)) {
      return { ok: false, error: `${botType} temporarily unavailable (circuit open)` };
    }
    if (!this.isWorkerReady(botType)) {
      return { ok: false, error: `${botType} not ready` };
    }
    return { ok: true };
  }

  private async requestWithRetry<T>(
    botType: BotType,
    fn: () => Promise<T>,
    idempotent: boolean
  ): Promise<T> {
    let attempt = 0;
    let lastError: unknown;

    const maxAttempts = idempotent ? RETRY_MAX + 1 : 1;
    while (attempt < maxAttempts) {
      try {
        const result = await fn();
        this.recordSuccess(botType);
        return result;
      } catch (error) {
        lastError = error;
        this.recordFailure(botType);
        if (attempt >= maxAttempts - 1) {
          break;
        }
        const backoff = RETRY_BASE_MS * Math.pow(2, attempt);
        const jitter = Math.floor(Math.random() * RETRY_BASE_MS);
        await sleep(backoff + jitter);
      }
      attempt += 1;
    }

    throw lastError;
  }

  private async enqueueTTS(payload: {
    requestId: string;
    guildId: string;
    text: string;
    voice?: string;
    userId?: string;
  }): Promise<boolean> {
    if (!this.ttsQueue) return false;
    const useQueue = process.env['TTS_QUEUE_ENABLED'] === 'true';
    if (!useQueue) return false;

    try {
      await this.ttsQueue.add('speak', payload, {
        jobId: payload.requestId,
        removeOnComplete: true,
        removeOnFail: true,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 500,
        },
      });
      return true;
    } catch (error) {
      log.warn(`Failed to enqueue TTS job: ${getErrorMessage(error)}`);
      return false;
    }
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
    const guard = this.guardWorker(botType);
    if (!guard.ok) {
      return { success: false, error: guard.error };
    }

    try {
      // Check if already connected
      const statusResponse = await this.requestWithRetry(
        botType,
        () => worker.get(`/status`, { params: { guildId } }),
        true
      );

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
        const retryStatus = await this.requestWithRetry(
          botType,
          () => worker.get(`/status`, { params: { guildId } }),
          true
        );
        if (retryStatus.data.connected && retryStatus.data.channelId === channelId) {
          log.debug(`${botType} connected via auto-follow`);
          await this.voiceStateManager.setWorkerStatus(botType, guildId, channelId, true);
          return { success: true };
        }
      }
      log.warn(`${botType} did not auto-follow, falling back to explicit join`);

      // Fallback: Join the channel explicitly
      const joinResponse = await this.requestWithRetry(
        botType,
        () =>
          worker.post('/join', {
            requestId,
            guildId,
            channelId,
          }),
        true
      );

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
    const guard = this.guardWorker(botType);
    if (!guard.ok) {
      log.warn(guard.error ?? `${botType} unavailable`);
      return;
    }

    try {
      await this.requestWithRetry(
        botType,
        () =>
          worker.post('/leave', {
            requestId,
            guildId,
          }),
        true
      );
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
    const guard = this.guardWorker('rainbot');
    if (!guard.ok) {
      return { success: false, message: guard.error };
    }

    try {
      const response = await this.requestWithRetry(
        'rainbot',
        () =>
          worker.post('/enqueue', {
            requestId,
            guildId,
            url,
            requestedBy,
            requestedByUsername,
          }),
        true
      );

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
    if (await this.enqueueTTS({ requestId, guildId, text, voice, userId })) {
      return { success: true, message: 'Queued' };
    }
    const worker = this.workers.get('pranjeet');

    if (!worker) {
      return { success: false, message: 'TTS worker not configured' };
    }
    const guard = this.guardWorker('pranjeet');
    if (!guard.ok) {
      return { success: false, message: guard.error };
    }

    try {
      const response = await this.requestWithRetry(
        'pranjeet',
        () =>
          worker.post('/speak', {
            requestId,
            guildId,
            text,
            voice,
            userId,
          }),
        true
      );

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
    const guard = this.guardWorker('hungerbot');
    if (!guard.ok) {
      return { success: false, message: guard.error };
    }

    try {
      const response = await this.requestWithRetry(
        'hungerbot',
        () =>
          worker.post('/play-sound', {
            requestId,
            guildId,
            userId,
            sfxId,
            volume,
          }),
        true
      );

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
    const guard = this.guardWorker(botType);
    if (!guard.ok) {
      return { success: false, message: guard.error };
    }

    try {
      const response = await this.requestWithRetry(
        botType,
        () =>
          worker.post('/volume', {
            requestId,
            guildId,
            volume,
          }),
        true
      );

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
      if (this.isCircuitOpen(botType) || !this.isWorkerReady(botType)) {
        statuses[botType] = { connected: false, error: `${botType} unavailable` };
        continue;
      }
      try {
        const response = await this.requestWithRetry(
          botType,
          () => worker.get('/status', { params: { guildId } }),
          true
        );
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
    const guard = this.guardWorker('rainbot');
    if (!guard.ok) {
      return { success: false, message: guard.error };
    }

    try {
      const response = await this.requestWithRetry(
        'rainbot',
        () =>
          worker.post('/skip', {
            requestId,
            guildId,
            count,
          }),
        true
      );

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
    const guard = this.guardWorker('rainbot');
    if (!guard.ok) {
      return { success: false, message: guard.error };
    }

    try {
      const response = await this.requestWithRetry(
        'rainbot',
        () =>
          worker.post('/pause', {
            requestId,
            guildId,
          }),
        true
      );

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
    const guard = this.guardWorker('rainbot');
    if (!guard.ok) {
      return { success: false, message: guard.error };
    }

    try {
      const response = await this.requestWithRetry(
        'rainbot',
        () =>
          worker.post('/stop', {
            requestId,
            guildId,
          }),
        true
      );

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
    const guard = this.guardWorker('rainbot');
    if (!guard.ok) {
      return { success: false, message: guard.error };
    }

    try {
      const response = await this.requestWithRetry(
        'rainbot',
        () =>
          worker.post('/clear', {
            requestId,
            guildId,
          }),
        true
      );

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
    if (this.isCircuitOpen('rainbot') || !this.isWorkerReady('rainbot')) {
      return { nowPlaying: null, queue: [], totalInQueue: 0, currentTrack: null, paused: false };
    }

    try {
      const response = await this.requestWithRetry(
        'rainbot',
        () => worker.get('/queue', { params: { guildId } }),
        true
      );

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
    const guard = this.guardWorker('rainbot');
    if (!guard.ok) {
      return { success: false, message: guard.error };
    }

    try {
      const response = await this.requestWithRetry(
        'rainbot',
        () =>
          worker.post('/autoplay', {
            requestId,
            guildId,
            enabled,
          }),
        true
      );

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
    const guard = this.guardWorker('rainbot');
    if (!guard.ok) {
      return { success: false, message: guard.error };
    }

    try {
      const response = await this.requestWithRetry(
        'rainbot',
        () =>
          worker.post('/replay', {
            requestId,
            guildId,
          }),
        true
      );

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
