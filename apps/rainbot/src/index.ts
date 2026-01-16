import { Client, GatewayIntentBits, Events } from 'discord.js';
import {
  joinVoiceChannel,
  createAudioPlayer,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState,
  VoiceConnection,
  AudioPlayer,
  AudioResource,
} from '@discordjs/voice';
import { fetchTracks } from './voice/trackFetcher';
import { createTrackResourceForAny } from './voice/audioResource';
import type { Track } from '@rainbot/protocol';
import { TrackKind } from '@rainbot/protocol';
import { rainbotRouter, createContext } from '@rainbot/rpc';
import * as trpcExpress from '@trpc/server/adapters/express';
import express, { Request, Response } from 'express';
import { Mutex } from 'async-mutex';

const PORT = parseInt(process.env['PORT'] || process.env['RAINBOT_PORT'] || '3001', 10);
const TOKEN = process.env['RAINBOT_TOKEN'];
const ORCHESTRATOR_BOT_ID = process.env['ORCHESTRATOR_BOT_ID'] || process.env['RAINCLOUD_BOT_ID'];
const RAINCLOUD_URL = process.env['RAINCLOUD_URL'];
const WORKER_SECRET = process.env['WORKER_SECRET'];
const WORKER_INSTANCE_ID =
  process.env['RAILWAY_REPLICA_ID'] || process.env['RAILWAY_SERVICE_ID'] || process.env['HOSTNAME'];
const WORKER_VERSION = process.env['RAILWAY_GIT_COMMIT_SHA'] || process.env['GIT_COMMIT_SHA'];

const hasToken = !!TOKEN;
const hasOrchestrator = !!ORCHESTRATOR_BOT_ID;

function formatError(err: unknown): { message: string; stack?: string } {
  if (err instanceof Error) {
    return { message: err.message, stack: err.stack };
  }
  return { message: String(err) };
}

async function registerWithOrchestrator(): Promise<void> {
  if (!RAINCLOUD_URL || !WORKER_SECRET) {
    console.warn('[RAINBOT] Worker registration skipped (missing RAINCLOUD_URL or WORKER_SECRET)');
    return;
  }

  const normalized = RAINCLOUD_URL.match(/^https?:\/\//)
    ? RAINCLOUD_URL.replace(/\/$/, '')
    : `http://${RAINCLOUD_URL.replace(/\/$/, '')}`;
  const defaultPort =
    process.env['RAILWAY_ENVIRONMENT'] || process.env['RAILWAY_PUBLIC_DOMAIN'] ? 8080 : 3000;
  const baseUrl = normalized.match(/:\d+$/) ? normalized : `${normalized}:${defaultPort}`;
  try {
    const response = await fetch(`${baseUrl}/internal/workers/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-worker-secret': WORKER_SECRET,
      },
      body: JSON.stringify({
        botType: 'rainbot',
        instanceId: WORKER_INSTANCE_ID,
        startedAt: new Date().toISOString(),
        version: WORKER_VERSION,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      console.warn(`[RAINBOT] Worker registration failed: ${response.status} ${text}`);
    } else {
      console.log('[RAINBOT] Worker registered with orchestrator');
    }
  } catch (error) {
    const info = formatError(error);
    const err = error as { cause?: unknown };
    const cause =
      err.cause && typeof err.cause === 'object' && 'message' in err.cause
        ? (err.cause as { message?: string }).message
        : err.cause
          ? String(err.cause)
          : 'n/a';
    console.warn(`[RAINBOT] Worker registration error: ${info.message}; cause=${cause}`);
  }
}

process.on('unhandledRejection', (reason) => {
  const info = formatError(reason);
  console.error(`[RAINBOT] Unhandled promise rejection: ${info.message}`);
  if (info.stack) console.error(info.stack);
});

process.on('uncaughtException', (error) => {
  const info = formatError(error);
  console.error(`[RAINBOT] Uncaught exception: ${info.message}`);
  if (info.stack) console.error(info.stack);
  process.exitCode = 1;
});

console.log(`[RAINBOT] Starting (pid=${process.pid}, node=${process.version})`);
console.log(
  `[RAINBOT] Config: port=${PORT}, hasToken=${hasToken}, hasOrchestrator=${hasOrchestrator}`
);
console.log(
  `[RAINBOT] Worker registration config: raincloudUrl=${RAINCLOUD_URL || 'unset'}, hasWorkerSecret=${!!WORKER_SECRET}`
);

if (!hasToken) {
  console.error('RAINBOT_TOKEN environment variable is required');
}

if (!hasOrchestrator) {
  console.error('ORCHESTRATOR_BOT_ID environment variable is required for auto-follow');
}

interface GuildState {
  connection: VoiceConnection | null;
  player: AudioPlayer;
  queue: Track[];
  currentTrack: Track | null;
  currentResource: AudioResource | null;
  lastPlayedTrack: Track | null;
  volume: number;
  nowPlaying: string | null;
  playbackStartTime: number | null;
  pauseStartTime: number | null;
  totalPausedTime: number;
  autoplay: boolean;
}

const guildStates = new Map<string, GuildState>();
const requestCache = new Map<string, unknown>();
const mutex = new Mutex();
let serverStarted = false;

function startServer(): void {
  if (serverStarted) return;
  serverStarted = true;
  app.listen(PORT, () => {
    console.log(`[RAINBOT] Worker server listening on port ${PORT}`);
  });
}

function ensureClientReady(res: Response): boolean {
  if (!client.isReady()) {
    res.status(503).json({ status: 'error', message: 'Bot not ready' });
    return false;
  }
  return true;
}

function getOrCreateGuildState(guildId: string): GuildState {
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
      console.error(`[RAINBOT] Player error in guild ${guildId}: ${error.message}`);
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

function resetPlaybackTiming(state: GuildState) {
  state.playbackStartTime = Date.now();
  state.pauseStartTime = null;
  state.totalPausedTime = 0;
}

function markPaused(state: GuildState) {
  if (!state.pauseStartTime) {
    state.pauseStartTime = Date.now();
  }
}

function markResumed(state: GuildState) {
  if (state.pauseStartTime) {
    state.totalPausedTime += Date.now() - state.pauseStartTime;
    state.pauseStartTime = null;
  }
}

function getPlaybackPosition(state: GuildState): number {
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
    console.log(
      `[RAINBOT] playNext title="${track.title}" url="${track.url}" sourceType=${track.sourceType || 'n/a'}`
    );
    const resource = await createTrackResourceForAny(track);

    if (resource.volume) {
      resource.volume.setVolume(state.volume / 100);
    }

    state.currentResource = resource;
    resetPlaybackTiming(state);
    state.player.play(resource);
    console.log(`[RAINBOT] Playing: ${track.title} in guild ${guildId}`);
  } catch (error) {
    console.error(`[RAINBOT] Error playing track: ${(error as Error).message}`);
    // Skip to next track on error
    playNext(guildId);
  }
}

// Express server for worker protocol
const app = express();
app.use(express.json());
app.use(
  '/trpc',
  trpcExpress.createExpressMiddleware({
    router: rainbotRouter,
    createContext,
  })
);

// Join voice channel
app.post('/join', async (req: Request, res: Response) => {
  if (!ensureClientReady(res)) return;
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
      setTimeout(() => requestCache.delete(requestId), 60000);
      res.status(404).json(response);
      return;
    }

    const channel = guild.channels.cache.get(channelId);
    if (!channel || !channel.isVoiceBased()) {
      const response = { status: 'error', message: 'Voice channel not found' };
      requestCache.set(requestId, response);
      setTimeout(() => requestCache.delete(requestId), 60000);
      res.status(404).json(response);
      return;
    }

    const state = getOrCreateGuildState(guildId);

    if (state.connection && state.connection.state.status !== VoiceConnectionStatus.Destroyed) {
      const response = { status: 'already_connected', channelId };
      requestCache.set(requestId, response);
      setTimeout(() => requestCache.delete(requestId), 60000);
      res.json(response);
      return;
    }

    const connection = joinVoiceChannel({
      channelId: channel.id,
      guildId: guild.id,
      adapterCreator: guild.voiceAdapterCreator as any,
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
        console.log(`[RAINBOT] Connection lost in guild ${guildId}, attempting rejoin...`);
        connection.destroy();
        state.connection = null;
      }
    });

    const response = { status: 'joined', channelId };
    requestCache.set(requestId, response);
    setTimeout(() => requestCache.delete(requestId), 60000);
    res.json(response);
  } catch (error) {
    console.error('[RAINBOT] Join error:', error);
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
    setTimeout(() => requestCache.delete(requestId), 60000);
    res.json(response);
    return;
  }

  state.connection.destroy();
  state.connection = null;
  state.queue = [];
  state.currentTrack = null;

  const response = { status: 'left' };
  requestCache.set(requestId, response);
  setTimeout(() => requestCache.delete(requestId), 60000);
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
  setTimeout(() => requestCache.delete(requestId), 60000);
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
    setTimeout(() => requestCache.delete(requestId), 60000);
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
    setTimeout(() => requestCache.delete(requestId), 60000);
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
  setTimeout(() => requestCache.delete(requestId), 60000);
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
  setTimeout(() => requestCache.delete(requestId), 60000);
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
  setTimeout(() => requestCache.delete(requestId), 60000);
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
  setTimeout(() => requestCache.delete(requestId), 60000);
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
    setTimeout(() => requestCache.delete(requestId), 60000);
    return res.json(response);
  }

  const track = { ...state.lastPlayedTrack };
  state.queue.unshift(track);
  state.player.stop();

  const response = { status: 'success', track: track.title };
  requestCache.set(requestId, response);
  setTimeout(() => requestCache.delete(requestId), 60000);
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
  setTimeout(() => requestCache.delete(requestId), 60000);
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

// Discord client
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
});

/**
 * Auto-follow: Watch for orchestrator (Raincloud) joining/leaving voice channels
 * and automatically join/leave the same channel
 */
client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
  // Only care about the orchestrator bot
  if (newState.member?.id !== ORCHESTRATOR_BOT_ID && oldState.member?.id !== ORCHESTRATOR_BOT_ID) {
    return;
  }

  const guildId = newState.guild?.id || oldState.guild?.id;
  if (!guildId) return;

  const orchestratorLeft = oldState.channelId && !newState.channelId;
  const orchestratorJoined = !oldState.channelId && newState.channelId;
  const orchestratorMoved =
    oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId;

  if (orchestratorLeft) {
    // Orchestrator left - leave too
    console.log(`[RAINBOT] Orchestrator left voice in guild ${guildId}, following...`);
    const state = guildStates.get(guildId);
    if (state?.connection) {
      state.connection.destroy();
      state.connection = null;
      state.queue = [];
      state.currentTrack = null;
    }
  } else if (orchestratorJoined || orchestratorMoved) {
    // Orchestrator joined/moved - follow
    const channelId = newState.channelId!;
    console.log(
      `[RAINBOT] Orchestrator joined channel ${channelId} in guild ${guildId}, following...`
    );

    const guild = client.guilds.cache.get(guildId);
    const channel = guild?.channels.cache.get(channelId);
    if (!channel || !channel.isVoiceBased()) return;

    const state = getOrCreateGuildState(guildId);

    // Disconnect from old channel if moving
    if (state.connection && state.connection.state.status !== VoiceConnectionStatus.Destroyed) {
      state.connection.destroy();
    }

    const connection = joinVoiceChannel({
      channelId: channel.id,
      guildId: guild!.id,
      adapterCreator: guild!.voiceAdapterCreator as any,
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
      } catch {
        console.log(`[RAINBOT] Connection lost in guild ${guildId}`);
        connection.destroy();
        state.connection = null;
      }
    });
  }
});

client.once(Events.ClientReady, () => {
  console.log(`[RAINBOT] Ready as ${client.user?.tag}`);
  console.log(`[RAINBOT] Auto-follow enabled for orchestrator: ${ORCHESTRATOR_BOT_ID}`);

  // Start HTTP server
  startServer();

  void registerWithOrchestrator();
});

client.on('error', (error) => {
  console.error('[RAINBOT] Client error:', error);
});

if (hasToken) {
  client.login(TOKEN);
} else {
  console.warn('[RAINBOT] Bot token missing; running in degraded mode (HTTP only)');
  startServer();
}
