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
import type { Track } from '@rainbot/protocol';
import { TrackKind } from '@rainbot/protocol';
import { rainbotRouter, createContext } from '@rainbot/rpc';
import * as trpcExpress from '@trpc/server/adapters/express';
import { Request, Response } from 'express';
import { Mutex } from 'async-mutex';
import { createLogger } from '@rainbot/shared';
import {
  setupProcessErrorHandlers,
  logErrorWithStack,
} from '@rainbot/worker-shared';
import {
  registerWithOrchestrator,
} from '@rainbot/worker-shared';
import { reportSoundStat } from '@rainbot/worker-shared';
import { createWorkerExpressApp } from '@rainbot/worker-shared';
import { ensureClientReady } from '@rainbot/worker-shared';
import { RequestCache } from '@rainbot/worker-shared';
import {
  createWorkerDiscordClient,
  setupDiscordClientErrorHandler,
  setupDiscordClientReadyHandler,
  loginDiscordClient,
} from '@rainbot/worker-shared';
import {
  setupAutoFollowVoiceStateHandler,
  type GuildState,
} from '@rainbot/worker-shared';

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
  state.nowPlaying = track.title;

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
          soundName: track.title,
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
    playNext(guildId);
  }
}

// Express server for worker protocol
const app = createWorkerExpressApp();
app.use(
  '/trpc',
  trpcExpress.createExpressMiddleware({
    router: rainbotRouter,
    createContext,
  })
);

// Join voice channel
app.post('/join', async (req: Request, res: Response) => {
  if (!ensureClientReady(client, res)) return;
  const { requestId, guildId, channelId } = req.body;

  if (!requestId || !guildId || !channelId) {
    res.status(400).json({
      status: 'error',
      message: 'Missing required fields',
    });
    return;
  }

  // Idempotency check
  if (requestCache.has(requestId)) {
    res.json(requestCache.get(requestId));
    return;
  }

  try {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) {
      const response = { status: 'error', message: 'Guild not found' };
      requestCache.set(requestId, response);
      res.status(404).json(response);
      return;
    }

    const channel = guild.channels.cache.get(channelId);
    if (!channel || !channel.isVoiceBased()) {
      const response = { status: 'error', message: 'Voice channel not found' };
      requestCache.set(requestId, response);
      res.status(404).json(response);
      return;
    }

    const state = getOrCreateGuildState(guildId);

    if (state.connection && state.connection.state.status !== VoiceConnectionStatus.Destroyed) {
      const response = { status: 'already_connected', channelId };
      requestCache.set(requestId, response);
      res.json(response);
      return;
    }

    const connection = joinVoiceChannel({
      channelId: channel.id,
      guildId: guild.id,
      adapterCreator: guild.voiceAdapterCreator as any,
      selfDeaf: false,
    });

    connection.subscribe(state.player);
    state.connection = connection;

    // Auto-rejoin on disconnect (network issues only)
    connection.on(VoiceConnectionStatus.Disconnected, async () => {
      try {
        await Promise.race([
          entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
          entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
        ]);
        // Connection recovered
      } catch (_error) {
        // Connection destroyed, attempt rejoin
        log.warn(`Connection lost in guild ${guildId}, attempting rejoin...`);
        connection.destroy();
        state.connection = null;
      }
    });

    const response = { status: 'joined', channelId };
    requestCache.set(requestId, response);
    res.json(response);
  } catch (error) {
    logErrorWithStack(log, 'Join error', error);
    const response = { status: 'error', message: (error as Error).message };
    res.status(500).json(response);
  }
});

// Leave voice channel
app.post('/leave', async (req: Request, res: Response) => {
  const { requestId, guildId } = req.body;

  if (!requestId || !guildId) {
    res.status(400).json({
      status: 'error',
      message: 'Missing required fields',
    });
    return;
  }

  // Idempotency check
  if (requestCache.has(requestId)) {
    res.json(requestCache.get(requestId));
    return;
  }

  const state = guildStates.get(guildId);
  if (!state || !state.connection) {
    const response = { status: 'not_connected' };
    requestCache.set(requestId, response);
    res.json(response);
    return;
  }

  state.connection.destroy();
  state.connection = null;
  state.queue = [];
  state.currentTrack = null;

  const response = { status: 'left' };
  requestCache.set(requestId, response);
  res.json(response);
});

// Set volume
app.post('/volume', async (req: Request, res: Response) => {
  const { requestId, guildId, volume } = req.body;

  if (!requestId || !guildId || volume === undefined) {
    return res.status(400).json({
      status: 'error',
      message: 'Missing required fields',
    });
  }

  let normalizedVolume = volume;
  if (normalizedVolume >= 0 && normalizedVolume <= 1) {
    normalizedVolume = Math.round(normalizedVolume * 100);
  }
  if (normalizedVolume < 0 || normalizedVolume > 100) {
    return res.status(400).json({
      status: 'error',
      message: 'Volume must be between 0 and 100',
    });
  }

  // Idempotency check
  if (requestCache.has(requestId)) {
    return res.json(requestCache.get(requestId));
  }

  const state = getOrCreateGuildState(guildId);
  state.volume = normalizedVolume;
  if (state.currentResource?.volume) {
    state.currentResource.volume.setVolume(state.volume / 100);
  }

  const response = { status: 'success', volume: state.volume };
  requestCache.set(requestId, response);
  res.json(response);
});

// Get status
app.get('/status', (req: Request, res: Response) => {
  const guildId = req.query['guildId'] as string;

  if (!guildId) {
    return res.status(400).json({ error: 'Missing guildId parameter' });
  }

  const state = guildStates.get(guildId);
  if (!state) {
    return res.json({
      connected: false,
      playing: false,
      nowPlaying: null,
      queueLength: 0,
    });
  }

  res.json({
    connected: state.connection !== null,
    channelId: state.connection?.joinConfig.channelId,
    playing: state.player.state.status === AudioPlayerStatus.Playing,
    queueLength: state.queue.length,
    volume: state.volume,
    nowPlaying: state.nowPlaying,
    activePlayers: Array.from(guildStates.values()).filter((entry) => entry.connection !== null)
      .length,
  });
});

// Enqueue track
app.post('/enqueue', async (req: Request, res: Response) => {
  const { requestId, guildId, url, requestedBy, requestedByUsername } = req.body;

  if (!requestId || !guildId || !url) {
    return res.status(400).json({
      status: 'error',
      message: 'Missing required fields',
    });
  }

  // Idempotency check
  if (requestCache.has(requestId)) {
    return res.json(requestCache.get(requestId));
  }

  const release = await mutex.acquire();
  try {
    const state = getOrCreateGuildState(guildId);

    const fetchedTracks = await fetchTracks(url, guildId);
    if (!fetchedTracks.length) {
      throw new Error('No tracks found for the requested source');
    }

    const tracks = fetchedTracks.map((track) => ({
      ...track,
      kind: track.kind ?? TrackKind.Music,
      userId: requestedBy,
      username: requestedByUsername || undefined,
    }));

    state.queue.push(...tracks);

    // Start playing if not already
    if (state.player.state.status === AudioPlayerStatus.Idle && state.connection) {
      playNext(guildId);
    }

    const response = {
      status: 'success',
      position: state.queue.length - tracks.length + 1,
      message: `Added ${tracks.length} track(s) to queue`,
    };
    requestCache.set(requestId, response);
    res.json(response);
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: (error as Error).message,
    });
  } finally {
    release();
  }
});

// Skip current track(s)
app.post('/skip', async (req: Request, res: Response) => {
  const { requestId, guildId, count = 1 } = req.body;

  if (!requestId || !guildId) {
    return res.status(400).json({
      status: 'error',
      message: 'Missing required fields',
    });
  }

  // Idempotency check
  if (requestCache.has(requestId)) {
    return res.json(requestCache.get(requestId));
  }

  const state = guildStates.get(guildId);
  if (!state) {
    const response = { status: 'error', message: 'Not connected' };
    requestCache.set(requestId, response);
    return res.json(response);
  }

  const skipped: string[] = [];

  // Skip current track
  if (state.currentTrack) {
    skipped.push(state.currentTrack.title);
  }

  // Remove additional tracks from queue if count > 1
  for (let i = 1; i < count && state.queue.length > 0; i++) {
    const removed = state.queue.shift();
    if (removed) {
      skipped.push(removed.title);
    }
  }

  // Stop current playback (will trigger Idle event and play next)
  state.player.stop();

  const response = { status: 'success', skipped };
  requestCache.set(requestId, response);
  res.json(response);
});

// Pause/resume playback
app.post('/pause', async (req: Request, res: Response) => {
  const { requestId, guildId } = req.body;

  if (!requestId || !guildId) {
    return res.status(400).json({
      status: 'error',
      message: 'Missing required fields',
    });
  }

  // Idempotency check
  if (requestCache.has(requestId)) {
    return res.json(requestCache.get(requestId));
  }

  const state = guildStates.get(guildId);
  if (!state) {
    const response = { status: 'error', message: 'Not connected' };
    return res.json(response);
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

  const response = { status: 'success', paused };
  requestCache.set(requestId, response);
  res.json(response);
});

// Stop playback and clear queue
app.post('/stop', async (req: Request, res: Response) => {
  const { requestId, guildId } = req.body;

  if (!requestId || !guildId) {
    return res.status(400).json({
      status: 'error',
      message: 'Missing required fields',
    });
  }

  // Idempotency check
  if (requestCache.has(requestId)) {
    return res.json(requestCache.get(requestId));
  }

  const state = guildStates.get(guildId);
  if (!state) {
    const response = { status: 'error', message: 'Not connected' };
    return res.json(response);
  }

  state.player.stop();
  state.queue = [];
  state.currentTrack = null;
  state.currentResource = null;
  state.nowPlaying = null;
  state.playbackStartTime = null;
  state.pauseStartTime = null;
  state.totalPausedTime = 0;

  const response = { status: 'success' };
  requestCache.set(requestId, response);
  res.json(response);
});

// Clear queue (keep current track playing)
app.post('/clear', async (req: Request, res: Response) => {
  const { requestId, guildId } = req.body;

  if (!requestId || !guildId) {
    return res.status(400).json({
      status: 'error',
      message: 'Missing required fields',
    });
  }

  // Idempotency check
  if (requestCache.has(requestId)) {
    return res.json(requestCache.get(requestId));
  }

  const state = guildStates.get(guildId);
  if (!state) {
    const response = { status: 'error', message: 'Not connected' };
    return res.json(response);
  }

  const cleared = state.queue.length;
  state.queue = [];

  const response = { status: 'success', cleared };
  requestCache.set(requestId, response);
  res.json(response);
});

// Get queue info
app.get('/queue', (req: Request, res: Response) => {
  const guildId = req.query['guildId'] as string;

  if (!guildId) {
    return res.status(400).json({ error: 'Missing guildId parameter' });
  }

  const state = guildStates.get(guildId);
  if (!state) {
    return res.json({
      nowPlaying: null,
      queue: [],
      totalInQueue: 0,
      currentTrack: null,
      isPaused: false,
      playbackPosition: 0,
      autoplay: false,
    });
  }

  res.json({
    nowPlaying: state.currentTrack?.title || null,
    queue: state.queue.slice(0, 20),
    totalInQueue: state.queue.length,
    currentTrack: state.currentTrack,
    isPaused: state.player.state.status === AudioPlayerStatus.Paused,
    playbackPosition: getPlaybackPosition(state),
    autoplay: state.autoplay,
  });
});

// Replay last played track
app.post('/replay', async (req: Request, res: Response) => {
  const { requestId, guildId } = req.body;

  if (!requestId || !guildId) {
    return res.status(400).json({
      status: 'error',
      message: 'Missing required fields',
    });
  }

  if (requestCache.has(requestId)) {
    return res.json(requestCache.get(requestId));
  }

  const state = guildStates.get(guildId);
  if (!state || !state.lastPlayedTrack) {
    const response = { status: 'error', message: 'No track to replay' };
    requestCache.set(requestId, response);
    return res.json(response);
  }

  const track = { ...state.lastPlayedTrack };
  state.queue.unshift(track);
  state.player.stop();

  const response = { status: 'success', track: track.title };
  requestCache.set(requestId, response);
  res.json(response);
});

// Autoplay toggle (disabled for now)
app.post('/autoplay', async (req: Request, res: Response) => {
  const { requestId, guildId } = req.body;

  if (!requestId || !guildId) {
    return res.status(400).json({
      status: 'error',
      message: 'Missing required fields',
    });
  }

  if (requestCache.has(requestId)) {
    return res.json(requestCache.get(requestId));
  }

  const state = getOrCreateGuildState(guildId);
  state.autoplay = false;

  const response = {
    status: 'success',
    enabled: false,
    message: 'Autoplay is disabled in the rainbot worker',
  };
  requestCache.set(requestId, response);
  res.json(response);
});

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
setupAutoFollowVoiceStateHandler(client, {
  orchestratorBotId: ORCHESTRATOR_BOT_ID!,
  guildStates: guildStates as unknown as Map<string, GuildState>,
  getOrCreateGuildState: (guildId: string) => getOrCreateGuildState(guildId) as unknown as GuildState,
  logger: log,
});

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
