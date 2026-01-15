import { Client, GatewayIntentBits, Events } from 'discord.js';
import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState,
  VoiceConnection,
  AudioPlayer,
} from '@discordjs/voice';
import { rainbotRouter, createContext } from '@rainbot/rpc';
import * as trpcExpress from '@trpc/server/adapters/express';
import express, { Request, Response } from 'express';
import { Mutex } from 'async-mutex';

const PORT = parseInt(process.env['RAINBOT_PORT'] || '3001', 10);
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

  const baseUrl = RAINCLOUD_URL.replace(/\/$/, '');
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
    console.warn(`[RAINBOT] Worker registration error: ${info.message}`);
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
  volume: number;
}

interface Track {
  url: string;
  title: string;
  requestedBy: string;
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
      }
    });

    player.on('error', (error) => {
      console.error(`[RAINBOT] Player error in guild ${guildId}:`, error);
    });

    guildStates.set(guildId, {
      connection: null,
      player,
      queue: [],
      currentTrack: null,
      volume: 0.5,
    });
  }
  return guildStates.get(guildId)!;
}

async function playNext(guildId: string): Promise<void> {
  const state = getOrCreateGuildState(guildId);

  if (state.queue.length === 0) {
    state.currentTrack = null;
    return;
  }

  const track = state.queue.shift()!;
  state.currentTrack = track;

  try {
    const resource = createAudioResource(track.url, {
      inlineVolume: true,
    });

    if (resource.volume) {
      resource.volume.setVolume(state.volume);
    }

    state.player.play(resource);
    console.log(`[RAINBOT] Playing: ${track.title} in guild ${guildId}`);
  } catch (error) {
    console.error(`[RAINBOT] Error playing track:`, error);
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

  if (volume < 0 || volume > 1) {
    return res.status(400).json({
      status: 'error',
      message: 'Volume must be between 0 and 1',
    });
  }

  // Idempotency check
  if (requestCache.has(requestId)) {
    return res.json(requestCache.get(requestId));
  }

  const state = getOrCreateGuildState(guildId);
  state.volume = volume;

  const response = { status: 'success', volume };
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
      queueLength: 0,
    });
  }

  res.json({
    connected: state.connection !== null,
    channelId: state.connection?.joinConfig.channelId,
    playing: state.player.state.status === AudioPlayerStatus.Playing,
    queueLength: state.queue.length,
    volume: state.volume,
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

    const track: Track = {
      url,
      title: url, // In production, fetch actual title
      requestedBy: requestedByUsername || requestedBy,
    };

    state.queue.push(track);

    // Start playing if not already
    if (state.player.state.status === AudioPlayerStatus.Idle && state.connection) {
      playNext(guildId);
    }

    const response = {
      status: 'success',
      position: state.queue.length,
      message: `Added to queue at position ${state.queue.length}`,
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
    paused = false;
  } else {
    state.player.pause();
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
      paused: false,
    });
  }

  res.json({
    nowPlaying: state.currentTrack?.title || null,
    queue: state.queue.map((t) => ({ title: t.title, url: t.url })),
    totalInQueue: state.queue.length,
    currentTrack: state.currentTrack,
    paused: state.player.state.status === AudioPlayerStatus.Paused,
  });
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
