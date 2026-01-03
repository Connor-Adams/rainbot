import { Client, GatewayIntentBits } from 'discord.js';
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
import express, { Request, Response } from 'express';
import { Mutex } from 'async-mutex';

const PORT = parseInt(process.env['RAINBOT_PORT'] || '3001', 10);
const TOKEN = process.env['RAINBOT_TOKEN'];

if (!TOKEN) {
  console.error('RAINBOT_TOKEN environment variable is required');
  process.exit(1);
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

// Join voice channel
app.post('/join', async (req: Request, res: Response) => {
  const { requestId, guildId, channelId } = req.body;

  if (!requestId || !guildId || !channelId) {
    return res.status(400).json({
      status: 'error',
      message: 'Missing required fields',
    });
  }

  // Idempotency check
  if (requestCache.has(requestId)) {
    return res.json(requestCache.get(requestId));
  }

  try {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) {
      const response = { status: 'error', message: 'Guild not found' };
      requestCache.set(requestId, response);
      setTimeout(() => requestCache.delete(requestId), 60000);
      return res.status(404).json(response);
    }

    const channel = guild.channels.cache.get(channelId);
    if (!channel || !channel.isVoiceBased()) {
      const response = { status: 'error', message: 'Voice channel not found' };
      requestCache.set(requestId, response);
      setTimeout(() => requestCache.delete(requestId), 60000);
      return res.status(404).json(response);
    }

    const state = getOrCreateGuildState(guildId);

    if (state.connection && state.connection.state.status !== VoiceConnectionStatus.Destroyed) {
      const response = { status: 'already_connected', channelId };
      requestCache.set(requestId, response);
      setTimeout(() => requestCache.delete(requestId), 60000);
      return res.json(response);
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
      } catch (error) {
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
  if (!state || !state.connection) {
    const response = { status: 'not_connected' };
    requestCache.set(requestId, response);
    setTimeout(() => requestCache.delete(requestId), 60000);
    return res.json(response);
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

// Health checks
app.get('/health/live', (req: Request, res: Response) => {
  res.status(200).send('OK');
});

app.get('/health/ready', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    botType: 'rainbot',
    timestamp: Date.now(),
  });
});

// Discord client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

client.once('ready', () => {
  console.log(`[RAINBOT] Ready as ${client.user?.tag}`);
  
  // Start HTTP server
  app.listen(PORT, () => {
    console.log(`[RAINBOT] Worker server listening on port ${PORT}`);
  });
});

client.on('error', (error) => {
  console.error('[RAINBOT] Client error:', error);
});

client.login(TOKEN);
