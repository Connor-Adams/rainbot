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
  StreamType,
} from '@discordjs/voice';
import express, { Request, Response } from 'express';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { Readable } from 'stream';
import * as fs from 'fs';
import * as path from 'path';

const PORT = parseInt(process.env['HUNGERBOT_PORT'] || '3003', 10);
const TOKEN = process.env['HUNGERBOT_TOKEN'];
const SOUNDS_DIR = process.env['SOUNDS_DIR'] || './sounds';
const ORCHESTRATOR_BOT_ID = process.env['ORCHESTRATOR_BOT_ID'] || process.env['RAINCLOUD_BOT_ID'];

// S3 Configuration
const S3_BUCKET =
  process.env['STORAGE_BUCKET_NAME'] || process.env['AWS_S3_BUCKET_NAME'] || process.env['BUCKET'];
const S3_ACCESS_KEY =
  process.env['STORAGE_ACCESS_KEY'] ||
  process.env['AWS_ACCESS_KEY_ID'] ||
  process.env['ACCESS_KEY_ID'];
const S3_SECRET_KEY =
  process.env['STORAGE_SECRET_KEY'] ||
  process.env['AWS_SECRET_ACCESS_KEY'] ||
  process.env['SECRET_ACCESS_KEY'];
const S3_ENDPOINT =
  process.env['STORAGE_ENDPOINT'] || process.env['AWS_ENDPOINT_URL'] || process.env['ENDPOINT'];
const S3_REGION = process.env['STORAGE_REGION'] || process.env['AWS_DEFAULT_REGION'] || 'us-east-1';

if (!TOKEN) {
  console.error('HUNGERBOT_TOKEN environment variable is required');
  process.exit(1);
}

if (!ORCHESTRATOR_BOT_ID) {
  console.error('ORCHESTRATOR_BOT_ID environment variable is required for auto-follow');
  process.exit(1);
}

// Initialize S3 client if configured
let s3Client: S3Client | null = null;
if (S3_BUCKET && S3_ACCESS_KEY && S3_SECRET_KEY && S3_ENDPOINT) {
  s3Client = new S3Client({
    endpoint: S3_ENDPOINT,
    region: S3_REGION,
    credentials: {
      accessKeyId: S3_ACCESS_KEY,
      secretAccessKey: S3_SECRET_KEY,
    },
    forcePathStyle: false,
  });
  console.log(`[HUNGERBOT] S3 storage initialized: bucket "${S3_BUCKET}"`);
} else {
  console.log(`[HUNGERBOT] S3 not configured, using local storage: ${SOUNDS_DIR}`);
}

interface GuildState {
  connection: VoiceConnection | null;
  userPlayers: Map<string, AudioPlayer>; // Per-user audio players
  volume: number;
}

const guildStates = new Map<string, GuildState>();
const requestCache = new Map<string, unknown>();

/**
 * Get a sound stream from S3 or local filesystem
 */
async function getSoundStream(sfxId: string): Promise<Readable> {
  // Normalize filename (add extension if not present)
  const filename = sfxId.includes('.') ? sfxId : `${sfxId}.mp3`;

  // Try S3 first if configured
  if (s3Client && S3_BUCKET) {
    try {
      const command = new GetObjectCommand({
        Bucket: S3_BUCKET,
        Key: `sounds/${filename}`,
      });

      const response = await s3Client.send(command);

      if (response.Body && typeof (response.Body as any).transformToWebStream === 'function') {
        // Node.js SDK v3 returns a web stream, convert to Node stream
        const webStream = (response.Body as any).transformToWebStream();
        return Readable.fromWeb(webStream as any);
      }

      if (response.Body instanceof Readable) {
        return response.Body;
      }

      throw new Error('Invalid response body from S3');
    } catch (error) {
      console.error(`[HUNGERBOT] S3 fetch failed for ${filename}:`, error);
      // Fall through to local storage
    }
  }

  // Try local filesystem
  const localPath = path.join(SOUNDS_DIR, filename);
  if (fs.existsSync(localPath)) {
    console.log(`[HUNGERBOT] Loading sound from local: ${localPath}`);
    return fs.createReadStream(localPath);
  }

  throw new Error(`Sound file not found: ${filename}`);
}

function getOrCreateGuildState(guildId: string): GuildState {
  if (!guildStates.has(guildId)) {
    guildStates.set(guildId, {
      connection: null,
      userPlayers: new Map(),
      volume: 0.7,
    });
  }
  return guildStates.get(guildId)!;
}

function getOrCreateUserPlayer(guildId: string, userId: string): AudioPlayer {
  const state = getOrCreateGuildState(guildId);

  if (!state.userPlayers.has(userId)) {
    const player = createAudioPlayer();

    player.on('error', (error) => {
      console.error(`[HUNGERBOT] Player error for user ${userId} in guild ${guildId}:`, error);
    });

    state.userPlayers.set(userId, player);

    // Subscribe player to connection
    if (state.connection) {
      state.connection.subscribe(player);
    }
  }

  return state.userPlayers.get(userId)!;
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

    state.connection = connection;

    // Subscribe all existing user players
    state.userPlayers.forEach((player) => {
      connection.subscribe(player);
    });

    // Auto-rejoin on disconnect
    connection.on(VoiceConnectionStatus.Disconnected, async () => {
      try {
        await Promise.race([
          entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
          entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
        ]);
      } catch (_error) {
        console.log(`[HUNGERBOT] Connection lost in guild ${guildId}, attempting rejoin...`);
        connection.destroy();
        state.connection = null;
      }
    });

    const response = { status: 'joined', channelId };
    requestCache.set(requestId, response);
    setTimeout(() => requestCache.delete(requestId), 60000);
    res.json(response);
  } catch (error) {
    console.error('[HUNGERBOT] Join error:', error);
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
  state.userPlayers.clear();

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
    });
  }

  let anyPlaying = false;
  state.userPlayers.forEach((player) => {
    if (player.state.status === AudioPlayerStatus.Playing) {
      anyPlaying = true;
    }
  });

  res.json({
    connected: state.connection !== null,
    channelId: state.connection?.joinConfig.channelId,
    playing: anyPlaying,
    activePlayers: state.userPlayers.size,
    volume: state.volume,
  });
});

// Play sound effect
app.post('/play-sound', async (req: Request, res: Response) => {
  const { requestId, guildId, userId, sfxId, volume } = req.body;

  if (!requestId || !guildId || !userId || !sfxId) {
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
    const state = getOrCreateGuildState(guildId);

    if (!state.connection) {
      const response = { status: 'error', message: 'Not connected to voice channel' };
      requestCache.set(requestId, response);
      setTimeout(() => requestCache.delete(requestId), 60000);
      return res.status(400).json(response);
    }

    // Get or create player for this user
    const player = getOrCreateUserPlayer(guildId, userId);

    // Load sound from S3 or local storage
    const soundStream = await getSoundStream(sfxId);

    // Create audio resource from stream
    const resource = createAudioResource(soundStream, {
      inputType: StreamType.Arbitrary,
      inlineVolume: true,
    });

    const effectiveVolume = volume !== undefined ? volume : state.volume;
    if (resource.volume) {
      resource.volume.setVolume(effectiveVolume);
    }

    // Play sound (replaces user's previous sound if still playing)
    player.play(resource);

    console.log(`[HUNGERBOT] Playing sound ${sfxId} for user ${userId} in guild ${guildId}`);

    const response = { status: 'success', message: 'Sound playing' };
    requestCache.set(requestId, response);
    setTimeout(() => requestCache.delete(requestId), 60000);
    res.json(response);
  } catch (error) {
    console.error('[HUNGERBOT] Play sound error:', error);
    const response = { status: 'error', message: (error as Error).message };
    res.status(500).json(response);
  }
});

// Cleanup user's player
app.post('/cleanup-user', async (req: Request, res: Response) => {
  const { guildId, userId } = req.body;

  if (!guildId || !userId) {
    return res.status(400).json({
      status: 'error',
      message: 'Missing required fields',
    });
  }

  const state = guildStates.get(guildId);
  if (state) {
    const player = state.userPlayers.get(userId);
    if (player) {
      player.stop();
      state.userPlayers.delete(userId);
    }
  }

  res.json({ status: 'success' });
});

// Health checks
app.get('/health/live', (req: Request, res: Response) => {
  res.status(200).send('OK');
});

app.get('/health/ready', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    botType: 'hungerbot',
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
    console.log(`[HUNGERBOT] Orchestrator left voice in guild ${guildId}, following...`);
    const state = guildStates.get(guildId);
    if (state?.connection) {
      state.connection.destroy();
      state.connection = null;
      state.userPlayers.clear();
    }
  } else if (orchestratorJoined || orchestratorMoved) {
    // Orchestrator joined/moved - follow
    const channelId = newState.channelId!;
    console.log(
      `[HUNGERBOT] Orchestrator joined channel ${channelId} in guild ${guildId}, following...`
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

    state.connection = connection;

    // Subscribe all existing user players
    state.userPlayers.forEach((player) => {
      connection.subscribe(player);
    });

    // Auto-rejoin on disconnect (network issues only)
    connection.on(VoiceConnectionStatus.Disconnected, async () => {
      try {
        await Promise.race([
          entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
          entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
        ]);
      } catch {
        console.log(`[HUNGERBOT] Connection lost in guild ${guildId}`);
        connection.destroy();
        state.connection = null;
      }
    });
  }
});

client.once('ready', () => {
  console.log(`[HUNGERBOT] Ready as ${client.user?.tag}`);
  console.log(`[HUNGERBOT] Auto-follow enabled for orchestrator: ${ORCHESTRATOR_BOT_ID}`);

  // Start HTTP server
  app.listen(PORT, () => {
    console.log(`[HUNGERBOT] Worker server listening on port ${PORT}`);
  });
});

client.on('error', (error) => {
  console.error('[HUNGERBOT] Client error:', error);
});

client.login(TOKEN);
