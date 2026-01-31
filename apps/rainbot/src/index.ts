import { Events } from 'discord.js';
import {
  joinVoiceChannel,
  createAudioPlayer,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState,
  AudioResource,
} from '@discordjs/voice';
import { fetchTracks } from './voice/trackFetcher';
import { createTrackResourceForAny } from './voice/audioResource';
import type { Track } from '@rainbot/types/voice';
import type { PlaybackState, QueueState } from '@rainbot/types/media';
import { createRainbotRouter, createContext } from '@rainbot/rpc';
import type {
  JoinRequest,
  JoinResponse,
  LeaveRequest,
  LeaveResponse,
  VolumeRequest,
  VolumeResponse,
  StatusResponse,
  EnqueueTrackRequest,
  EnqueueTrackResponse,
  SkipResponse,
  PauseResponse,
  StopResponse,
  ClearResponse,
  QueueResponse,
  AutoplayResponse,
  ReplayResponse,
  SeekRequest,
  SeekResponse,
} from '@rainbot/worker-protocol';
import * as trpcExpress from '@trpc/server/adapters/express';
import { Request, Response } from 'express';
import { Mutex } from 'async-mutex';
import { createLogger } from '@rainbot/shared';
import { setupProcessErrorHandlers, logErrorWithStack } from '@rainbot/worker-shared';
import { registerWithOrchestrator } from '@rainbot/worker-shared';
import { reportSoundStat } from '@rainbot/worker-shared';
import { createWorkerExpressApp } from '@rainbot/worker-shared';
import { RequestCache } from '@rainbot/worker-shared';
import {
  createWorkerDiscordClient,
  setupDiscordClientErrorHandler,
  setupDiscordClientReadyHandler,
  loginDiscordClient,
} from '@rainbot/worker-shared';
import { setupAutoFollowVoiceStateHandler, type GuildState } from '@rainbot/worker-shared';

const PORT = parseInt(process.env['PORT'] || process.env['RAINBOT_PORT'] || '3001', 10);
const TOKEN = process.env['RAINBOT_TOKEN'];
const ORCHESTRATOR_BOT_ID = process.env['ORCHESTRATOR_BOT_ID'] || process.env['RAINCLOUD_BOT_ID'];
const RAINCLOUD_URL = process.env['RAINCLOUD_URL'];
const WORKER_SECRET = process.env['WORKER_SECRET'];

const log = createLogger('RAINBOT');

const hasToken = !!TOKEN;
const hasOrchestrator = !!ORCHESTRATOR_BOT_ID;

// Setup process error handlers
setupProcessErrorHandlers(log);

log.info(`Starting (pid=${process.pid}, node=${process.version})`);
log.info(`Config: port=${PORT}, hasToken=${hasToken}, hasOrchestrator=${hasOrchestrator}`);
log.info(
  `Worker registration config: raincloudUrl=${RAINCLOUD_URL || 'unset'}, hasWorkerSecret=${!!WORKER_SECRET}`
);
log.info(
  `Stats reporting config: raincloudUrl=${RAINCLOUD_URL || 'unset'}, hasWorkerSecret=${!!WORKER_SECRET}`
);

if (!hasToken) {
  log.error('RAINBOT_TOKEN environment variable is required');
}

if (!hasOrchestrator) {
  log.error('ORCHESTRATOR_BOT_ID environment variable is required for auto-follow');
}

interface RainbotGuildState extends GuildState {
  queue: Track[];
  currentTrack: Track | null;
  currentResource: AudioResource | null;
  lastPlayedTrack: Track | null;
  nowPlaying: string | null;
  playbackStartTime: number | null;
  pauseStartTime: number | null;
  totalPausedTime: number;
  autoplay: boolean;
  volume: number;
}

const guildStates = new Map<string, RainbotGuildState>();
const requestCache = new RequestCache();
const mutex = new Mutex();
let serverStarted = false;

// Declare client early so it can be used in route handlers
// Will be initialized later with createWorkerDiscordClient()
let client: ReturnType<typeof createWorkerDiscordClient>;

function startServer(): void {
  if (serverStarted) return;
  serverStarted = true;
  app.listen(PORT, () => {
    log.info(`Worker server listening on port ${PORT}`);
  });
}

function getStateForRpc(input?: { guildId?: string }): StatusResponse {
  const guildId = input?.guildId;
  if (guildId) {
    const state = guildStates.get(guildId);
    if (!state) {
      return { connected: false, playing: false };
    }
    const connected =
      !!state.connection && state.connection.state.status !== VoiceConnectionStatus.Destroyed;
    const playing = state.player.state.status === AudioPlayerStatus.Playing;
    const channelId = state.connection?.joinConfig?.channelId;
    return {
      connected,
      playing,
      channelId: channelId ?? undefined,
      queueLength: state.queue.length,
      volume: state.volume / 100,
    };
  }
  return { connected: false, playing: false };
}

async function handleJoin(input: JoinRequest): Promise<JoinResponse> {
  if (!client?.isReady?.()) {
    return { status: 'error', message: 'Worker not ready' };
  }
  const cacheKey = `join:${input.requestId}`;
  if (requestCache.has(cacheKey)) {
    return requestCache.get(cacheKey) as JoinResponse;
  }
  try {
    const guild = client.guilds.cache.get(input.guildId);
    if (!guild) {
      const response: JoinResponse = { status: 'error', message: 'Guild not found' };
      requestCache.set(cacheKey, response);
      return response;
    }
    const channel = guild.channels.cache.get(input.channelId);
    if (!channel || !channel.isVoiceBased()) {
      const response: JoinResponse = { status: 'error', message: 'Voice channel not found' };
      requestCache.set(cacheKey, response);
      return response;
    }
    const state = getOrCreateGuildState(input.guildId);
    if (state.connection && state.connection.state.status !== VoiceConnectionStatus.Destroyed) {
      const response: JoinResponse = { status: 'already_connected', channelId: input.channelId };
      requestCache.set(cacheKey, response);
      return response;
    }
    const connection = joinVoiceChannel({
      channelId: channel.id,
      guildId: guild.id,
      adapterCreator: guild.voiceAdapterCreator as any,
      selfDeaf: false,
    });
    connection.subscribe(state.player);
    state.connection = connection;
    connection.on(VoiceConnectionStatus.Disconnected, async () => {
      try {
        await Promise.race([
          entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
          entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
        ]);
      } catch (_error) {
        log.warn(`Connection lost in guild ${input.guildId}, attempting rejoin...`);
        connection.destroy();
        state.connection = null;
      }
    });
    const response: JoinResponse = { status: 'joined', channelId: input.channelId };
    requestCache.set(cacheKey, response);
    return response;
  } catch (error) {
    logErrorWithStack(log, 'Join error', error);
    const response: JoinResponse = { status: 'error', message: (error as Error).message };
    return response;
  }
}

async function handleLeave(input: LeaveRequest): Promise<LeaveResponse> {
  const cacheKey = `leave:${input.requestId}`;
  if (requestCache.has(cacheKey)) {
    return requestCache.get(cacheKey) as LeaveResponse;
  }
  const state = guildStates.get(input.guildId);
  if (!state || !state.connection) {
    const response: LeaveResponse = { status: 'not_connected' };
    requestCache.set(cacheKey, response);
    return response;
  }
  state.connection.destroy();
  state.connection = null;
  state.queue = [];
  state.currentTrack = null;
  const response: LeaveResponse = { status: 'left' };
  requestCache.set(cacheKey, response);
  return response;
}

async function handleVolume(input: VolumeRequest): Promise<VolumeResponse> {
  let normalizedVolume =
    input.volume >= 0 && input.volume <= 1
      ? Math.round(input.volume * 100)
      : Math.round(input.volume);
  if (normalizedVolume < 0 || normalizedVolume > 100) {
    return { status: 'error', message: 'Volume must be between 0 and 100' };
  }
  const cacheKey = `volume:${input.requestId}`;
  if (requestCache.has(cacheKey)) {
    return requestCache.get(cacheKey) as VolumeResponse;
  }
  const state = getOrCreateGuildState(input.guildId);
  state.volume = normalizedVolume;
  if (state.currentResource?.volume) {
    state.currentResource.volume.setVolume(state.volume / 100);
  }
  const response: VolumeResponse = { status: 'success', volume: state.volume / 100 };
  requestCache.set(cacheKey, response);
  return response;
}

async function handleEnqueue(input: EnqueueTrackRequest): Promise<EnqueueTrackResponse> {
  const cacheKey = `enqueue:${input.requestId}`;
  if (requestCache.has(cacheKey)) {
    return requestCache.get(cacheKey) as EnqueueTrackResponse;
  }
  const release = await mutex.acquire();
  try {
    const state = getOrCreateGuildState(input.guildId);
    const fetchedTracks = await fetchTracks(input.url, input.guildId);
    if (!fetchedTracks.length) {
      throw new Error('No tracks found for the requested source');
    }
    const tracks = fetchedTracks.map((track) => ({
      ...track,
      kind: 'music' as const,
      userId: input.requestedBy,
      username: input.requestedByUsername || undefined,
    }));
    state.queue.push(...tracks);
    if (state.player.state.status === AudioPlayerStatus.Idle && state.connection) {
      playNext(input.guildId);
    }
    const response: EnqueueTrackResponse = {
      status: 'success',
      position: state.queue.length - tracks.length + 1,
      message: `Added ${tracks.length} track(s) to queue`,
    };
    requestCache.set(cacheKey, response);
    return response;
  } catch (error) {
    return { status: 'error', message: (error as Error).message };
  } finally {
    release();
  }
}

async function handleSkip(input: {
  requestId: string;
  guildId: string;
  count?: number;
}): Promise<SkipResponse> {
  const count = input.count ?? 1;
  const cacheKey = `skip:${input.requestId}`;
  if (requestCache.has(cacheKey)) {
    return requestCache.get(cacheKey) as SkipResponse;
  }
  const state = guildStates.get(input.guildId);
  if (!state) {
    const response: SkipResponse = { status: 'error', message: 'Not connected' };
    requestCache.set(cacheKey, response);
    return response;
  }
  const skipped: string[] = [];
  if (state.currentTrack) {
    skipped.push(state.currentTrack.title ?? 'Unknown');
  }
  for (let i = 1; i < count && state.queue.length > 0; i++) {
    const removed = state.queue.shift();
    if (removed) skipped.push(removed.title ?? 'Unknown');
  }
  state.player.stop();
  const response: SkipResponse = { status: 'success', skipped };
  requestCache.set(cacheKey, response);
  return response;
}

async function handlePause(input: { requestId: string; guildId: string }): Promise<PauseResponse> {
  const cacheKey = `pause:${input.requestId}`;
  if (requestCache.has(cacheKey)) {
    return requestCache.get(cacheKey) as PauseResponse;
  }
  const state = guildStates.get(input.guildId);
  if (!state) {
    return { status: 'error', message: 'Not connected' };
  }
  let paused: boolean;
  if (state.player.state.status === AudioPlayerStatus.Paused) {
    state.player.unpause();
    markResumed(state);
    paused = false;
  } else {
    state.player.pause();
    markPaused(state);
    paused = true;
  }
  const response: PauseResponse = { status: 'success', paused };
  requestCache.set(cacheKey, response);
  return response;
}

async function handleStop(input: { requestId: string; guildId: string }): Promise<StopResponse> {
  const cacheKey = `stop:${input.requestId}`;
  if (requestCache.has(cacheKey)) {
    return requestCache.get(cacheKey) as StopResponse;
  }
  const state = guildStates.get(input.guildId);
  if (!state) {
    return { status: 'error', message: 'Not connected' };
  }
  state.player.stop();
  state.queue = [];
  state.currentTrack = null;
  state.currentResource = null;
  state.nowPlaying = null;
  state.playbackStartTime = null;
  state.pauseStartTime = null;
  state.totalPausedTime = 0;
  const response: StopResponse = { status: 'success' };
  requestCache.set(cacheKey, response);
  return response;
}

async function handleClear(input: { requestId: string; guildId: string }): Promise<ClearResponse> {
  const cacheKey = `clear:${input.requestId}`;
  if (requestCache.has(cacheKey)) {
    return requestCache.get(cacheKey) as ClearResponse;
  }
  const state = guildStates.get(input.guildId);
  if (!state) {
    return { status: 'error', message: 'Not connected' };
  }
  const cleared = state.queue.length;
  state.queue = [];
  const response: ClearResponse = { status: 'success', cleared };
  requestCache.set(cacheKey, response);
  return response;
}

async function handleGetQueue(input: { guildId: string }): Promise<QueueResponse> {
  const state = guildStates.get(input.guildId);
  if (!state) {
    return { queue: [] };
  }
  const playback = buildPlaybackState(state);
  const q = buildQueueState(state, playback);
  return {
    queue: (q.queue ?? []) as QueueResponse['queue'],
    nowPlaying: q.nowPlaying as QueueResponse['nowPlaying'],
    isPaused: q.isPaused,
    isAutoplay: q.isAutoplay,
  };
}

async function handleAutoplay(input: {
  requestId: string;
  guildId: string;
  enabled?: boolean | null;
}): Promise<AutoplayResponse> {
  const cacheKey = `autoplay:${input.requestId}`;
  if (requestCache.has(cacheKey)) {
    return requestCache.get(cacheKey) as AutoplayResponse;
  }
  const state = getOrCreateGuildState(input.guildId);
  state.autoplay = false;
  const response: AutoplayResponse = {
    status: 'success',
    enabled: false,
    message: 'Autoplay is disabled in the rainbot worker',
  };
  requestCache.set(cacheKey, response);
  return response;
}

async function handleReplay(input: {
  requestId: string;
  guildId: string;
}): Promise<ReplayResponse> {
  const cacheKey = `replay:${input.requestId}`;
  if (requestCache.has(cacheKey)) {
    return requestCache.get(cacheKey) as ReplayResponse;
  }
  const state = guildStates.get(input.guildId);
  if (!state || !state.lastPlayedTrack) {
    const response: ReplayResponse = { status: 'error', message: 'No track to replay' };
    requestCache.set(cacheKey, response);
    return response;
  }
  const track = { ...state.lastPlayedTrack };
  state.queue.unshift(track);
  if (state.player.state.status === AudioPlayerStatus.Idle && state.connection) {
    playNext(input.guildId);
  }
  const response: ReplayResponse = { status: 'success', track: track.title };
  requestCache.set(cacheKey, response);
  return response;
}

async function handleSeek(input: SeekRequest): Promise<SeekResponse> {
  const cacheKey = `seek:${input.requestId}`;
  if (requestCache.has(cacheKey)) {
    return requestCache.get(cacheKey) as SeekResponse;
  }
  const state = guildStates.get(input.guildId);
  if (!state) {
    const response: SeekResponse = { status: 'error', message: 'Not connected' };
    requestCache.set(cacheKey, response);
    return response;
  }
  if (!state.currentTrack) {
    const response: SeekResponse = { status: 'error', message: 'No track playing' };
    requestCache.set(cacheKey, response);
    return response;
  }
  if (!state.connection) {
    const response: SeekResponse = { status: 'error', message: 'Not connected' };
    requestCache.set(cacheKey, response);
    return response;
  }
  const track = state.currentTrack;
  let positionSeconds = Math.max(0, Math.floor(input.positionSeconds));
  if (track.duration != null && track.duration > 0) {
    positionSeconds = Math.min(positionSeconds, track.duration);
  }
  try {
    state.player.stop();
    const resource = await createTrackResourceForAny(track, positionSeconds);
    if (resource.volume) {
      resource.volume.setVolume(state.volume / 100);
    }
    state.currentResource = resource;
    state.playbackStartTime = Date.now() - positionSeconds * 1000;
    state.pauseStartTime = null;
    state.totalPausedTime = 0;
    state.player.play(resource);
    log.info(`Seeked to ${positionSeconds}s in "${track.title}" in guild ${input.guildId}`);
    const response: SeekResponse = { status: 'success' };
    requestCache.set(cacheKey, response);
    return response;
  } catch (error) {
    const err = error as Error;
    log.error(`Seek failed in guild ${input.guildId}: ${err.message}`);
    const response: SeekResponse = { status: 'error', message: err.message };
    requestCache.set(cacheKey, response);
    return response;
  }
}

const rainbotRouter = createRainbotRouter({
  getState: getStateForRpc,
  join: handleJoin,
  leave: handleLeave,
  volume: handleVolume,
  enqueue: handleEnqueue,
  skip: handleSkip,
  pause: handlePause,
  stop: handleStop,
  clear: handleClear,
  getQueue: handleGetQueue,
  autoplay: handleAutoplay,
  replay: handleReplay,
  seek: handleSeek,
});

function getOrCreateGuildState(guildId: string): RainbotGuildState {
  if (!guildStates.has(guildId)) {
    const player = createAudioPlayer();

    player.on(AudioPlayerStatus.Idle, () => {
      const state = guildStates.get(guildId);
      if (state && state.queue.length > 0) {
        playNext(guildId);
      } else if (state) {
        state.nowPlaying = null;
        state.currentTrack = null;
        state.currentResource = null;
        state.playbackStartTime = null;
        state.pauseStartTime = null;
        state.totalPausedTime = 0;
      }
    });

    player.on('error', (error) => {
      log.error(`Player error in guild ${guildId}: ${error.message}`);
      if (error.stack) {
        log.debug(error.stack);
      }
    });

    guildStates.set(guildId, {
      connection: null,
      player,
      queue: [],
      currentTrack: null,
      currentResource: null,
      lastPlayedTrack: null,
      volume: 100,
      nowPlaying: null,
      playbackStartTime: null,
      pauseStartTime: null,
      totalPausedTime: 0,
      autoplay: false,
    });
  }
  return guildStates.get(guildId)!;
}

function resetPlaybackTiming(state: RainbotGuildState) {
  state.playbackStartTime = Date.now();
  state.pauseStartTime = null;
  state.totalPausedTime = 0;
}

function markPaused(state: RainbotGuildState) {
  if (!state.pauseStartTime) {
    state.pauseStartTime = Date.now();
  }
}

function markResumed(state: RainbotGuildState) {
  if (state.pauseStartTime) {
    state.totalPausedTime += Date.now() - state.pauseStartTime;
    state.pauseStartTime = null;
  }
}

function getPlaybackPosition(state: RainbotGuildState): number {
  if (!state.playbackStartTime || !state.currentTrack) {
    return 0;
  }

  const elapsed = Date.now() - state.playbackStartTime;
  const pausedTime = state.totalPausedTime;
  const currentPauseTime = state.pauseStartTime ? Date.now() - state.pauseStartTime : 0;
  let playbackPosition = Math.max(0, Math.floor((elapsed - pausedTime - currentPauseTime) / 1000));

  if (state.currentTrack.duration && playbackPosition > state.currentTrack.duration) {
    playbackPosition = state.currentTrack.duration;
  }

  return playbackPosition;
}

function buildPlaybackState(state: RainbotGuildState | null): PlaybackState {
  if (!state) {
    return { status: 'idle' };
  }

  let status: PlaybackState['status'] = 'idle';
  if (state.player.state.status === AudioPlayerStatus.Paused) {
    status = 'paused';
  } else if (state.player.state.status === AudioPlayerStatus.Playing) {
    status = 'playing';
  }

  const positionMs = getPlaybackPosition(state) * 1000;
  const durationMs =
    state.currentTrack?.durationMs ??
    (state.currentTrack?.duration ? state.currentTrack.duration * 1000 : undefined);

  return {
    status,
    positionMs: positionMs > 0 ? positionMs : undefined,
    durationMs,
    volume: state.volume,
  };
}

function buildQueueState(state: RainbotGuildState | null, playback: PlaybackState): QueueState {
  if (!state) {
    return { queue: [] };
  }

  return {
    nowPlaying: state.currentTrack || (state.nowPlaying ? { title: state.nowPlaying } : undefined),
    queue: state.queue,
    isPaused: playback.status === 'paused',
    isAutoplay: state.autoplay,
  };
}

async function playNext(guildId: string): Promise<void> {
  const state = getOrCreateGuildState(guildId);

  if (state.queue.length === 0) {
    state.currentTrack = null;
    state.currentResource = null;
    state.nowPlaying = null;
    state.playbackStartTime = null;
    state.pauseStartTime = null;
    state.totalPausedTime = 0;
    return;
  }

  const track = state.queue.shift()!;
  state.currentTrack = track;
  state.lastPlayedTrack = track.url ? track : state.lastPlayedTrack;
  state.nowPlaying = track.title ?? null;

  try {
    log.info(
      `playNext title="${track.title}" url="${track.url}" sourceType=${track.sourceType || 'n/a'}`
    );
    const resource = await createTrackResourceForAny(track);

    if (resource.volume) {
      resource.volume.setVolume(state.volume / 100);
    }

    state.currentResource = resource;
    resetPlaybackTiming(state);
    state.player.play(resource);
    log.info(`Playing: ${track.title} in guild ${guildId}`);
    if (track.userId) {
      void reportSoundStat(
        {
          soundName: track.title ?? 'Unknown',
          userId: track.userId,
          guildId,
          sourceType: track.sourceType || 'other',
          isSoundboard: false,
          duration: track.duration ?? null,
          source: 'discord',
          username: track.username || null,
          discriminator: track.discriminator || null,
        },
        { logger: log }
      );
    }
  } catch (error) {
    logErrorWithStack(log, 'Error playing track', error);
    // Skip to next track on error
    await playNext(guildId);
  }
}

// Express server for worker protocol
const app = createWorkerExpressApp();
app.use((req: Request, res: Response, next) => {
  if (req.path.startsWith('/health')) {
    next();
    return;
  }

  // tRPC from Raincloud sends x-internal-secret; legacy/registration uses x-worker-secret (same value: WORKER_SECRET)
  const secret = req.header('x-internal-secret') || req.header('x-worker-secret');
  if (WORKER_SECRET && secret === WORKER_SECRET) {
    next();
    return;
  }

  if (!WORKER_SECRET) {
    res.status(503).json({ error: 'Worker secret not configured' });
    return;
  }
  res.status(401).json({ error: 'Unauthorized' });
});
app.use(
  '/trpc',
  trpcExpress.createExpressMiddleware({
    router: rainbotRouter,
    createContext,
  })
);

// Health checks
app.get('/health/live', (req: Request, res: Response) => {
  res.status(200).send('OK');
});

app.get('/health/ready', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    botType: 'rainbot',
    ready: hasToken && client.isReady(),
    degraded: !hasToken,
    timestamp: Date.now(),
  });
});

// Discord client - initialize here (declared earlier for use in routes)
client = createWorkerDiscordClient();
setupDiscordClientErrorHandler(client, log);

// Setup auto-follow voice state handler
if (ORCHESTRATOR_BOT_ID) {
  setupAutoFollowVoiceStateHandler(client, {
    orchestratorBotId: ORCHESTRATOR_BOT_ID,
    guildStates: guildStates as unknown as Map<string, GuildState>,
    getOrCreateGuildState: (guildId: string) =>
      getOrCreateGuildState(guildId) as unknown as GuildState,
    logger: log,
  });
} else {
  log.warn('ORCHESTRATOR_BOT_ID not set; auto-follow voice state handler disabled');
}

// Extend voice state handler for rainbot-specific cleanup
client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
  // Check if this is orchestrator auto-follow (handled by setupAutoFollowVoiceStateHandler)
  if (newState.member?.id === ORCHESTRATOR_BOT_ID || oldState.member?.id === ORCHESTRATOR_BOT_ID) {
    const guildId = newState.guild?.id || oldState.guild?.id;
    if (!guildId) return;

    const orchestratorLeft = oldState.channelId && !newState.channelId;
    if (orchestratorLeft) {
      // Additional rainbot-specific cleanup
      const state = guildStates.get(guildId);
      if (state) {
        state.queue = [];
        state.currentTrack = null;
      }
    }
  }
});

setupDiscordClientReadyHandler(client, {
  orchestratorBotId: ORCHESTRATOR_BOT_ID,
  logger: log,
  onReady: () => {
    // Start HTTP server
    startServer();

    void registerWithOrchestrator({
      botType: 'rainbot',
      logger: log,
    });
  },
});

void loginDiscordClient(client, TOKEN, {
  logger: log,
  onDegraded: () => {
    startServer();
  },
});
