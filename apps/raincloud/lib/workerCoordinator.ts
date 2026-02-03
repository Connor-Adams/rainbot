import { createLogger } from '@utils/logger';
import { VoiceStateManager } from './voiceStateManager';
import { v4 as uuidv4 } from 'uuid';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import {
  fetchWorkerHealthChecks,
  workerBaseUrls,
  rainbotClient,
  pranjeetClient,
  hungerbotClient,
} from '../src/rpc/clients';
import type { MediaKind, MediaState, PlaybackState, QueueState } from '@rainbot/types/media';

const log = createLogger('WORKER-COORDINATOR');

type BotType = 'rainbot' | 'pranjeet' | 'hungerbot';

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

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const cause = error.cause;
    if (cause instanceof Error && cause.message && cause.message !== error.message) {
      return `${error.message}: ${cause.message}`;
    }
    if (typeof cause === 'string') return `${error.message}: ${cause}`;
    return error.message;
  }
  if (typeof error === 'string') return error;
  return 'Unknown error';
}

const BOT_KINDS: Record<BotType, MediaKind> = {
  rainbot: 'music',
  pranjeet: 'tts',
  hungerbot: 'sfx',
};

function buildLegacyPlayback(record: Record<string, unknown>): PlaybackState {
  const playing = typeof record['playing'] === 'boolean' ? record['playing'] : false;
  const volume = typeof record['volume'] === 'number' ? record['volume'] : undefined;
  return {
    status: playing ? 'playing' : 'idle',
    volume,
  };
}

function normalizeQueueState(data: unknown): QueueState {
  if (!data || typeof data !== 'object') {
    return { queue: [] };
  }

  const record = data as Record<string, unknown>;
  const queue = Array.isArray(record['queue']) ? (record['queue'] as QueueState['queue']) : [];
  // Canonical: worker sends nowPlaying as object (QueueItemPayload). Legacy fallbacks for currentTrack/string.
  const nowPlaying =
    typeof record['nowPlaying'] === 'object' && record['nowPlaying'] !== null
      ? (record['nowPlaying'] as QueueState['nowPlaying'])
      : record['currentTrack'] && typeof record['currentTrack'] === 'object'
        ? (record['currentTrack'] as QueueState['nowPlaying'])
        : typeof record['nowPlaying'] === 'string'
          ? { title: record['nowPlaying'] }
          : undefined;

  const positionMs =
    typeof record['positionMs'] === 'number' && record['positionMs'] >= 0
      ? record['positionMs']
      : undefined;
  const durationMs =
    typeof record['durationMs'] === 'number' && record['durationMs'] >= 0
      ? record['durationMs']
      : undefined;

  return {
    nowPlaying,
    queue,
    isPaused:
      typeof record['isPaused'] === 'boolean'
        ? record['isPaused']
        : typeof record['paused'] === 'boolean'
          ? record['paused']
          : undefined,
    isAutoplay: typeof record['autoplay'] === 'boolean' ? record['autoplay'] : undefined,
    ...(positionMs != null && { positionMs }),
    ...(durationMs != null && { durationMs }),
  };
}

function normalizeWorkerStatus(data: unknown, botType: BotType, guildId: string): MediaState {
  const kind = BOT_KINDS[botType];

  if (!data || typeof data !== 'object') {
    return {
      guildId,
      kind,
      connected: false,
      playback: { status: 'idle' },
      queue: { queue: [] },
    };
  }

  const record = data as Record<string, unknown>;
  const playback =
    record['playback'] && typeof record['playback'] === 'object'
      ? (record['playback'] as PlaybackState)
      : buildLegacyPlayback(record);

  const queue =
    record['queue'] && typeof record['queue'] === 'object'
      ? normalizeQueueState(record['queue'])
      : normalizeQueueState(record);

  return {
    guildId,
    kind,
    channelId: typeof record['channelId'] === 'string' ? record['channelId'] : undefined,
    connected: typeof record['connected'] === 'boolean' ? record['connected'] : false,
    playback: playback.status ? playback : { status: 'idle' },
    queue,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class WorkerCoordinator {
  private circuit: Map<BotType, CircuitState>;
  private health: Map<BotType, WorkerHealth>;
  private ttsQueue: Queue | null;

  constructor(private voiceStateManager: VoiceStateManager) {
    this.circuit = new Map();
    this.health = new Map();
    this.ttsQueue = null;

    for (const botType of ['rainbot', 'pranjeet', 'hungerbot'] as const) {
      this.circuit.set(botType, { failureCount: 0, openedUntil: 0 });
      this.health.set(botType, { ready: true, lastChecked: 0 });
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

    if (workerBaseUrls && typeof workerBaseUrls === 'object') {
      const targets = Object.entries(workerBaseUrls)
        .map(([k, v]) => `${k}=${v}`)
        .join(', ');
      log.info(`Worker RPC targets: ${targets}`);
    }
    this.startHealthPolling();
  }

  private startHealthPolling(): void {
    const poll = async (): Promise<void> => {
      const rpcResults = await fetchWorkerHealthChecks().catch((error) => {
        log.warn(`RPC health checks failed: ${getErrorMessage(error)}`);
        return null;
      });

      for (const botType of ['rainbot', 'pranjeet', 'hungerbot'] as const) {
        const rpcResult = rpcResults?.[botType];
        if (rpcResult && rpcResult.status === 'fulfilled') {
          this.health.set(botType, { ready: true, lastChecked: Date.now() });
        } else {
          const message =
            rpcResult && rpcResult.status === 'rejected'
              ? getErrorMessage(rpcResult.reason)
              : 'RPC health check failed';
          this.health.set(botType, {
            ready: false,
            lastChecked: Date.now(),
            lastError: message,
          });
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
    const health = this.health.get(botType);
    if (health && !health.ready) {
      const hint = health.lastError ? ` (${health.lastError})` : '';
      return { ok: false, error: `${botType} not ready${hint}` };
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
    const guard = this.guardWorker(botType);
    if (!guard.ok) {
      return { success: false, error: guard.error };
    }

    try {
      const getStatus = async (): Promise<{ connected: boolean; channelId?: string }> => {
        if (botType === 'rainbot') {
          return rainbotClient.getState.query({ guildId });
        }
        if (botType === 'pranjeet') {
          return pranjeetClient.getState.query({ guildId });
        }
        return hungerbotClient.getState.query({ guildId });
      };

      const doJoin = async (): Promise<{ status: string; message?: string }> => {
        if (botType === 'rainbot') {
          return rainbotClient.join.mutate({ requestId, guildId, channelId });
        }
        if (botType === 'pranjeet') {
          return pranjeetClient.join.mutate({ requestId, guildId, channelId });
        }
        return hungerbotClient.join.mutate({ requestId, guildId, channelId });
      };

      let status = await this.requestWithRetry(botType, getStatus, true);
      if (status.connected && status.channelId === channelId) {
        log.debug(`${botType} already connected to channel ${channelId} in guild ${guildId}`);
        return { success: true };
      }

      log.debug(`${botType} not yet connected, waiting for auto-follow...`);
      for (let i = 0; i < 4; i++) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        status = await this.requestWithRetry(botType, getStatus, true);
        if (status.connected && status.channelId === channelId) {
          log.debug(`${botType} connected via auto-follow`);
          await this.voiceStateManager.setWorkerStatus(botType, guildId, channelId, true);
          return { success: true };
        }
      }
      log.warn(`${botType} did not auto-follow, falling back to explicit join`);

      const joinResponse = await this.requestWithRetry(botType, doJoin, true);
      if (joinResponse.status === 'joined' || joinResponse.status === 'already_connected') {
        await this.voiceStateManager.setWorkerStatus(botType, guildId, channelId, true);
        log.info(`${botType} joined channel ${channelId} in guild ${guildId}`);
        return { success: true };
      }
      return { success: false, error: joinResponse.message };
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
    const guard = this.guardWorker(botType);
    if (!guard.ok) {
      log.warn(guard.error ?? `${botType} unavailable`);
      return;
    }

    try {
      const doLeave = (): Promise<{ status: string }> => {
        if (botType === 'rainbot') {
          return rainbotClient.leave.mutate({ requestId, guildId });
        }
        if (botType === 'pranjeet') {
          return pranjeetClient.leave.mutate({ requestId, guildId });
        }
        return hungerbotClient.leave.mutate({ requestId, guildId });
      };
      await this.requestWithRetry(botType, doLeave, true);
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
    const guard = this.guardWorker('rainbot');
    if (!guard.ok) {
      return { success: false, message: guard.error };
    }

    try {
      const response = await this.requestWithRetry(
        'rainbot',
        () =>
          rainbotClient.enqueue.mutate({
            requestId,
            guildId,
            url,
            requestedBy,
            requestedByUsername,
          }),
        true
      );

      await this.voiceStateManager.refreshSession(guildId);

      if (response.status === 'success') {
        return {
          success: true,
          message: response.message,
          position: response.position,
        };
      }
      return { success: false, message: response.message };
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
    const guard = this.guardWorker('pranjeet');
    if (!guard.ok) {
      return { success: false, message: guard.error };
    }

    try {
      const response = await this.requestWithRetry(
        'pranjeet',
        () =>
          pranjeetClient.speak.mutate({
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

      if (response.status === 'success') {
        return { success: true, message: response.message };
      }

      return { success: false, message: response.message };
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
    const guard = this.guardWorker('hungerbot');
    if (!guard.ok) {
      return { success: false, message: guard.error };
    }

    try {
      const response = await this.requestWithRetry(
        'hungerbot',
        () =>
          hungerbotClient.playSound.mutate({
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

      if (response.status === 'success') {
        return { success: true, message: response.message };
      }

      return { success: false, message: response.message };
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
    const guard = this.guardWorker(botType);
    if (!guard.ok) {
      return { success: false, message: guard.error };
    }

    try {
      const doVolume = async () => {
        if (botType === 'rainbot') {
          return rainbotClient.volume.mutate({ requestId, guildId, volume });
        }
        if (botType === 'pranjeet') {
          return pranjeetClient.volume.mutate({ requestId, guildId, volume });
        }
        return hungerbotClient.volume.mutate({ requestId, guildId, volume });
      };
      const response = await this.requestWithRetry(botType, doVolume, true);

      if (response.status === 'success') {
        await this.voiceStateManager.setVolume(guildId, botType, volume);
        return { success: true };
      }
      return { success: false, message: response.message };
    } catch (error: unknown) {
      const errMsg = getErrorMessage(error);
      log.error(`Failed to set volume for ${botType}: ${errMsg}`);
      return { success: false, message: errMsg };
    }
  }

  /**
   * Get status for all workers in guild
   */
  async getWorkersStatus(guildId: string): Promise<Record<BotType, MediaState>> {
    const statuses: Partial<Record<BotType, MediaState>> = {};

    for (const botType of ['rainbot', 'pranjeet', 'hungerbot'] as const) {
      if (this.isCircuitOpen(botType) || !this.isWorkerReady(botType)) {
        statuses[botType] = {
          guildId,
          kind: BOT_KINDS[botType],
          connected: false,
          playback: { status: 'idle' },
          queue: { queue: [] },
        };
        continue;
      }
      try {
        if (botType === 'rainbot') {
          const [state, queue] = await Promise.all([
            this.requestWithRetry(botType, () => rainbotClient.getState.query({ guildId }), true),
            this.requestWithRetry(botType, () => rainbotClient.getQueue.query({ guildId }), true),
          ]);
          const record = {
            connected: state.connected,
            channelId: state.channelId,
            playing: state.playing,
            volume: state.volume,
            queue,
          };
          statuses[botType] = normalizeWorkerStatus(record, botType, guildId);
        } else if (botType === 'pranjeet') {
          const state = await this.requestWithRetry(
            botType,
            () => pranjeetClient.getState.query({ guildId }),
            true
          );
          statuses[botType] = normalizeWorkerStatus(state, botType, guildId);
        } else {
          const state = await this.requestWithRetry(
            botType,
            () => hungerbotClient.getState.query({ guildId }),
            true
          );
          statuses[botType] = normalizeWorkerStatus(state, botType, guildId);
        }
      } catch (_error) {
        statuses[botType] = {
          guildId,
          kind: BOT_KINDS[botType],
          connected: false,
          playback: { status: 'idle' },
          queue: { queue: [] },
        };
      }
    }

    return statuses as Record<BotType, MediaState>;
  }

  /**
   * Skip track(s) on Rainbot
   */
  async skipTrack(
    guildId: string,
    count: number = 1
  ): Promise<{ success: boolean; skipped?: string[]; message?: string }> {
    const requestId = uuidv4();
    const guard = this.guardWorker('rainbot');
    if (!guard.ok) {
      return { success: false, message: guard.error };
    }

    try {
      const response = await this.requestWithRetry(
        'rainbot',
        () => rainbotClient.skip.mutate({ requestId, guildId, count }),
        true
      );
      if (response.status === 'success') {
        return { success: true, skipped: response.skipped };
      }
      return { success: false, message: response.message };
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
    const guard = this.guardWorker('rainbot');
    if (!guard.ok) {
      return { success: false, message: guard.error };
    }

    try {
      const response = await this.requestWithRetry(
        'rainbot',
        () => rainbotClient.pause.mutate({ requestId, guildId }),
        true
      );
      if (response.status === 'success') {
        return { success: true, paused: response.paused };
      }
      return { success: false, message: response.message };
    } catch (error: unknown) {
      const message = getErrorMessage(error);
      log.error(`Failed to toggle pause: ${message}`);
      return { success: false, message };
    }
  }

  /**
   * Seek to position (seconds) on Rainbot
   */
  async seek(
    guildId: string,
    positionSeconds: number
  ): Promise<{ success: boolean; message?: string }> {
    const requestId = uuidv4();
    const guard = this.guardWorker('rainbot');
    if (!guard.ok) {
      return { success: false, message: guard.error };
    }

    try {
      const response = await this.requestWithRetry(
        'rainbot',
        () =>
          rainbotClient.seek.mutate({
            requestId,
            guildId,
            positionSeconds: Math.max(0, Math.floor(positionSeconds)),
          }),
        true
      );
      if (response.status === 'success') {
        return { success: true };
      }
      return { success: false, message: response.message };
    } catch (error: unknown) {
      const message = getErrorMessage(error);
      log.error(`Failed to seek: ${message}`);
      return { success: false, message };
    }
  }

  /**
   * Stop playback on Rainbot
   */
  async stopPlayback(guildId: string): Promise<{ success: boolean; message?: string }> {
    const requestId = uuidv4();
    const guard = this.guardWorker('rainbot');
    if (!guard.ok) {
      return { success: false, message: guard.error };
    }

    try {
      const response = await this.requestWithRetry(
        'rainbot',
        () => rainbotClient.stop.mutate({ requestId, guildId }),
        true
      );
      if (response.status === 'success') {
        return { success: true };
      }
      return { success: false, message: response.message };
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
    const guard = this.guardWorker('rainbot');
    if (!guard.ok) {
      return { success: false, message: guard.error };
    }

    try {
      const response = await this.requestWithRetry(
        'rainbot',
        () => rainbotClient.clear.mutate({ requestId, guildId }),
        true
      );
      if (response.status === 'success') {
        return { success: true, cleared: response.cleared };
      }
      return { success: false, message: response.message };
    } catch (error: unknown) {
      const message = getErrorMessage(error);
      log.error(`Failed to clear queue: ${message}`);
      return { success: false, message };
    }
  }

  /**
   * Get queue from Rainbot
   */
  async getQueue(guildId: string): Promise<QueueState> {
    if (this.isCircuitOpen('rainbot') || !this.isWorkerReady('rainbot')) {
      return { queue: [] };
    }

    try {
      const response = await this.requestWithRetry(
        'rainbot',
        () => rainbotClient.getQueue.query({ guildId }),
        true
      );
      return normalizeQueueState(response);
    } catch (error: unknown) {
      log.error(`Failed to get queue: ${getErrorMessage(error)}`);
      return { queue: [] };
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
    const guard = this.guardWorker('rainbot');
    if (!guard.ok) {
      return { success: false, message: guard.error };
    }

    try {
      const response = await this.requestWithRetry(
        'rainbot',
        () => rainbotClient.autoplay.mutate({ requestId, guildId, enabled }),
        true
      );
      if (response.status === 'success') {
        return { success: true, enabled: response.enabled };
      }
      return { success: false, message: response.message };
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
    const guard = this.guardWorker('rainbot');
    if (!guard.ok) {
      return { success: false, message: guard.error };
    }

    try {
      const response = await this.requestWithRetry(
        'rainbot',
        () => rainbotClient.replay.mutate({ requestId, guildId }),
        true
      );
      if (response.status === 'success') {
        return { success: true, track: response.track };
      }
      return { success: false, message: response.message };
    } catch (error: unknown) {
      const message = getErrorMessage(error);
      log.error(`Failed to replay: ${message}`);
      return { success: false, message };
    }
  }
}
