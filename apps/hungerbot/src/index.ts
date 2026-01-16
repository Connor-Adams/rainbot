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
import { createContext, hungerbotRouter } from '@rainbot/rpc';
import * as trpcExpress from '@trpc/server/adapters/express';
import express, { Request, Response } from 'express';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { Readable } from 'stream';
import * as fs from 'fs';
import * as path from 'path';
import { createLogger } from '@rainbot/shared';

const PORT = parseInt(process.env['PORT'] || process.env['HUNGERBOT_PORT'] || '3003', 10);
const TOKEN = process.env['HUNGERBOT_TOKEN'];
const SOUNDS_DIR = process.env['SOUNDS_DIR'] || './sounds';
const ORCHESTRATOR_BOT_ID = process.env['ORCHESTRATOR_BOT_ID'] || process.env['RAINCLOUD_BOT_ID'];
const RAINCLOUD_URL = process.env['RAINCLOUD_URL'];
const WORKER_SECRET = process.env['WORKER_SECRET'];
const WORKER_INSTANCE_ID =
  process.env['RAILWAY_REPLICA_ID'] || process.env['RAILWAY_SERVICE_ID'] || process.env['HOSTNAME'];
const WORKER_VERSION = process.env['RAILWAY_GIT_COMMIT_SHA'] || process.env['GIT_COMMIT_SHA'];

const log = createLogger('HUNGERBOT');

// S3 Configuration
const S3_BUCKET =
  process.env['AWS_S3_BUCKET_NAME'] || process.env['STORAGE_BUCKET_NAME'] || process.env['BUCKET'];
const S3_ACCESS_KEY =
  process.env['AWS_ACCESS_KEY_ID'] ||
  process.env['STORAGE_ACCESS_KEY'] ||
  process.env['ACCESS_KEY_ID'];
const S3_SECRET_KEY =
  process.env['AWS_SECRET_ACCESS_KEY'] ||
  process.env['STORAGE_SECRET_KEY'] ||
  process.env['SECRET_ACCESS_KEY'];
const S3_ENDPOINT =
  process.env['AWS_ENDPOINT_URL'] || process.env['STORAGE_ENDPOINT'] || process.env['ENDPOINT'];
const S3_REGION = process.env['AWS_DEFAULT_REGION'] || process.env['STORAGE_REGION'] || 'us-east-1';

const hasToken = !!TOKEN;
const hasOrchestrator = !!ORCHESTRATOR_BOT_ID;

function formatError(err: unknown): { message: string; stack?: string } {
  if (err instanceof Error) {
    return { message: err.message, stack: err.stack };
  }
  return { message: String(err) };
}

function logErrorWithStack(message: string, err: unknown): void {
  const info = formatError(err);
  log.error(`${message}: ${info.message}`);
  if (info.stack) {
    log.debug(info.stack);
  }
}

function getOrchestratorBaseUrl(): string | null {
  if (!RAINCLOUD_URL) return null;
  const normalized = RAINCLOUD_URL.match(/^https?:\/\//)
    ? RAINCLOUD_URL.replace(/\/$/, '')
    : `http://${RAINCLOUD_URL.replace(/\/$/, '')}`;
  const defaultPort =
    process.env['RAILWAY_ENVIRONMENT'] || process.env['RAILWAY_PUBLIC_DOMAIN'] ? 8080 : 3000;
  return normalized.match(/:\d+$/) ? normalized : `${normalized}:${defaultPort}`;
}

async function registerWithOrchestrator(): Promise<void> {
  if (!RAINCLOUD_URL || !WORKER_SECRET) {
    log.warn('Worker registration skipped (missing RAINCLOUD_URL or WORKER_SECRET)');
    return;
  }

  const baseUrl = getOrchestratorBaseUrl();
  if (!baseUrl) {
    log.warn('Worker registration skipped (invalid RAINCLOUD_URL)');
    return;
  }
  try {
    const response = await fetch(`${baseUrl}/internal/workers/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-worker-secret': WORKER_SECRET,
      },
      body: JSON.stringify({
        botType: 'hungerbot',
        instanceId: WORKER_INSTANCE_ID,
        startedAt: new Date().toISOString(),
        version: WORKER_VERSION,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      log.warn(`Worker registration failed: ${response.status} ${text}`);
    } else {
      log.info('Worker registered with orchestrator');
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
    log.warn(`Worker registration error: ${info.message}; cause=${cause}`);
    if (info.stack) {
      log.debug(info.stack);
    }
  }
}

async function reportSoundStat(payload: {
  soundName: string;
  userId: string;
  guildId: string;
  sourceType?: string;
  isSoundboard?: boolean;
  duration?: number | null;
  source?: string;
  username?: string | null;
  discriminator?: string | null;
}): Promise<void> {
  if (!WORKER_SECRET) return;
  const baseUrl = getOrchestratorBaseUrl();
  if (!baseUrl) return;

  try {
    const response = await fetch(`${baseUrl}/internal/stats/sound`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-worker-secret': WORKER_SECRET,
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const text = await response.text();
      log.warn(`Stats report failed: ${response.status} ${text}`);
    }
  } catch (error) {
    const info = formatError(error);
    log.warn(`Stats report failed: ${info.message}`);
  }
}

process.on('unhandledRejection', (reason) => {
  logErrorWithStack('Unhandled promise rejection', reason);
});

process.on('uncaughtException', (error) => {
  logErrorWithStack('Uncaught exception', error);
  process.exitCode = 1;
});

log.info(`Starting (pid=${process.pid}, node=${process.version})`);
log.info(`Config: port=${PORT}, hasToken=${hasToken}, hasOrchestrator=${hasOrchestrator}`);
log.info(
  `Worker registration config: raincloudUrl=${RAINCLOUD_URL || 'unset'}, hasWorkerSecret=${!!WORKER_SECRET}`
);
log.info(
  `Stats reporting config: raincloudUrl=${RAINCLOUD_URL || 'unset'}, hasWorkerSecret=${!!WORKER_SECRET}`
);

if (!hasToken) {
  log.error('HUNGERBOT_TOKEN environment variable is required');
}

if (!hasOrchestrator) {
  log.error('ORCHESTRATOR_BOT_ID environment variable is required for auto-follow');
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
  log.info(`S3 storage initialized: bucket "${S3_BUCKET}"`);
} else {
  log.info(`S3 not configured, using local storage: ${SOUNDS_DIR}`);
}

interface GuildState {
  connection: VoiceConnection | null;
  player: AudioPlayer;
  volume: number;
  soundQueue: SoundRequest[];
  isProcessingQueue: boolean;
}

const guildStates = new Map<string, GuildState>();
const requestCache = new Map<string, unknown>();
let serverStarted = false;
const SOUND_QUEUE_LIMIT = 10;

interface SoundRequest {
  requestId: string;
  guildId: string;
  userId: string;
  sfxId: string;
  volume?: number;
  inputType: StreamType;
}

function startServer(): void {
  if (serverStarted) return;
  serverStarted = true;
  app.listen(PORT, () => {
    log.info(`Worker server listening on port ${PORT}`);
  });
}

function ensureClientReady(res: Response): boolean {
  if (!client.isReady()) {
    res.status(503).json({ status: 'error', message: 'Bot not ready' });
    return false;
  }
  return true;
}

/**
 * Get a sound stream from S3 or local filesystem
 */
async function getSoundStream(sfxId: string): Promise<Readable> {
  // Normalize filename (add extension if not present)
  const filename = sfxId.includes('.') ? sfxId : `${sfxId}.mp3`;
  const oggFilename = getOggVariant(filename);
  log.debug(`Soundboard fetch start name=${filename}`);

  // Try S3 first if configured
  if (s3Client && S3_BUCKET) {
    try {
      if (oggFilename !== filename) {
        try {
          log.debug(`Soundboard fetch S3 bucket=${S3_BUCKET} key=sounds/${oggFilename}`);
          const oggResponse = await s3Client.send(
            new GetObjectCommand({
              Bucket: S3_BUCKET,
              Key: `sounds/${oggFilename}`,
            })
          );
          const oggStream = responseBodyToStream(oggResponse.Body);
          if (oggStream) {
            log.debug(`Soundboard fetch S3 stream ready name=${oggFilename}`);
            return oggStream;
          }
        } catch (error) {
          const err = error as { name?: string; $metadata?: { httpStatusCode?: number } };
          if (err.name !== 'NoSuchKey' && err.$metadata?.httpStatusCode !== 404) {
            logErrorWithStack(`S3 fetch failed for ${oggFilename}`, error);
          }
        }
      }

      log.debug(`Soundboard fetch S3 bucket=${S3_BUCKET} key=sounds/${filename}`);
      const response = await s3Client.send(
        new GetObjectCommand({
          Bucket: S3_BUCKET,
          Key: `sounds/${filename}`,
        })
      );

      const stream = responseBodyToStream(response.Body);
      if (stream) {
        log.debug(`Soundboard fetch S3 stream ready name=${filename}`);
        return stream;
      }

      throw new Error('Invalid response body from S3');
    } catch (error) {
      logErrorWithStack(`S3 fetch failed for ${filename}`, error);
      // Fall through to local storage
    }
  }

  // Try local filesystem
  const localOggPath = path.join(SOUNDS_DIR, oggFilename);
  if (oggFilename !== filename && fs.existsSync(localOggPath)) {
    log.debug(`Loading sound from local: ${localOggPath}`);
    return fs.createReadStream(localOggPath);
  }

  const localPath = path.join(SOUNDS_DIR, filename);
  if (fs.existsSync(localPath)) {
    log.debug(`Loading sound from local: ${localPath}`);
    return fs.createReadStream(localPath);
  }

  throw new Error(`Sound file not found: ${filename}`);
}

function responseBodyToStream(body: unknown): Readable | null {
  if (body && typeof (body as any).transformToWebStream === 'function') {
    const webStream = (body as any).transformToWebStream();
    return Readable.fromWeb(webStream as any);
  }
  if (body instanceof Readable) {
    return body;
  }
  return null;
}

function getOggVariant(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  if (ext === '.ogg' || ext === '.opus' || ext === '.oga' || ext === '.webm') {
    return filename;
  }
  if (!ext) return `${filename}.ogg`;
  return filename.slice(0, -ext.length) + '.ogg';
}

function getOrCreateGuildState(guildId: string): GuildState {
  if (!guildStates.has(guildId)) {
    const player = createAudioPlayer();
    player.on('error', (error) => {
      logErrorWithStack(`Player error in guild ${guildId}`, error);
    });
    player.on(AudioPlayerStatus.Idle, () => {
      void playNextQueuedSound(guildId);
    });

    guildStates.set(guildId, {
      connection: null,
      player,
      volume: 0.7,
      soundQueue: [],
      isProcessingQueue: false,
    });
  }
  return guildStates.get(guildId)!;
}

async function playNextQueuedSound(guildId: string): Promise<void> {
  const state = guildStates.get(guildId);
  if (!state || state.isProcessingQueue) return;
  if (state.soundQueue.length === 0) return;

  state.isProcessingQueue = true;
  const next = state.soundQueue.shift();
  if (!next) {
    state.isProcessingQueue = false;
    return;
  }

  try {
    await playSoundNow(state, next);
  } catch (error) {
    logErrorWithStack('Failed to play queued sound', error);
  } finally {
    state.isProcessingQueue = false;
    if (state.soundQueue.length > 0 && state.player.state.status === AudioPlayerStatus.Idle) {
      void playNextQueuedSound(guildId);
    }
  }
}

async function playSoundNow(state: GuildState, request: SoundRequest): Promise<void> {
  if (!state.connection) {
    throw new Error('Not connected to voice channel');
  }

  const soundStream = await getSoundStream(request.sfxId);
  const resource = createAudioResource(soundStream, {
    inputType: request.inputType,
    inlineVolume: true,
  });

  const effectiveVolume = request.volume !== undefined ? request.volume : state.volume;
  if (resource.volume) {
    resource.volume.setVolume(effectiveVolume);
  }

  log.info(
    `Soundboard volume=${effectiveVolume} inputType=${request.inputType} connected=${state.connection.state.status} player=${state.player.state.status}`
  );

  state.connection.subscribe(state.player);
  state.player.play(resource);
  log.info(`Soundboard play issued status=${state.player.state.status}`);
  log.info(`Playing sound ${request.sfxId} for user ${request.userId} in guild ${request.guildId}`);

  void reportSoundStat({
    soundName: request.sfxId,
    userId: request.userId,
    guildId: request.guildId,
    sourceType: 'local',
    isSoundboard: true,
    duration: null,
    source: 'discord',
  });
}

function normalizeSoundName(sfxId: string): string {
  return sfxId.includes('.') ? sfxId : `${sfxId}.mp3`;
}

function getSoundInputType(sfxId: string): StreamType {
  const ext = path.extname(normalizeSoundName(sfxId)).toLowerCase();
  if (ext === '.ogg' || ext === '.opus' || ext === '.oga') {
    return StreamType.OggOpus;
  }
  if (ext === '.webm') {
    return StreamType.WebmOpus;
  }
  return StreamType.Arbitrary;
}

// Express server for worker protocol
const app = express();
app.use(express.json());
app.use(
  '/trpc',
  trpcExpress.createExpressMiddleware({
    router: hungerbotRouter,
    createContext,
  })
);

// Join voice channel
app.post('/join', async (req: Request, res: Response) => {
  if (!ensureClientReady(res)) return;
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
      selfDeaf: false,
    });

    state.connection = connection;
    connection.subscribe(state.player);

    // Auto-rejoin on disconnect
    connection.on(VoiceConnectionStatus.Disconnected, async () => {
      try {
        await Promise.race([
          entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
          entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
        ]);
      } catch (_error) {
        log.warn(`Connection lost in guild ${guildId}, attempting rejoin...`);
        connection.destroy();
        state.connection = null;
      }
    });

    const response = { status: 'joined', channelId };
    requestCache.set(requestId, response);
    setTimeout(() => requestCache.delete(requestId), 60000);
    res.json(response);
  } catch (error) {
    logErrorWithStack('Join error', error);
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
  state.player.stop();

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

  res.json({
    connected: state.connection !== null,
    channelId: state.connection?.joinConfig.channelId,
    playing: state.player.state.status === AudioPlayerStatus.Playing,
    activePlayers: state.player.state.status === AudioPlayerStatus.Playing ? 1 : 0,
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

    const inputType = getSoundInputType(sfxId);
    if (inputType === StreamType.OggOpus || inputType === StreamType.WebmOpus) {
      await playSoundNow(state, { requestId, guildId, userId, sfxId, volume, inputType });
      const response = { status: 'success', message: 'Sound playing' };
      requestCache.set(requestId, response);
      setTimeout(() => requestCache.delete(requestId), 60000);
      return res.json(response);
    }

    if (state.soundQueue.length >= SOUND_QUEUE_LIMIT) {
      const response = { status: 'error', message: 'Soundboard queue is full' };
      requestCache.set(requestId, response);
      setTimeout(() => requestCache.delete(requestId), 60000);
      return res.status(429).json(response);
    }

    state.soundQueue.push({ requestId, guildId, userId, sfxId, volume, inputType });
    if (state.player.state.status === AudioPlayerStatus.Idle) {
      void playNextQueuedSound(guildId);
    }

    const response = { status: 'success', message: 'Sound queued' };
    requestCache.set(requestId, response);
    setTimeout(() => requestCache.delete(requestId), 60000);
    res.json(response);
  } catch (error) {
    logErrorWithStack('Play sound error', error);
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
    state.player.stop(true);
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
    log.info(`Orchestrator left voice in guild ${guildId}, following...`);
    const state = guildStates.get(guildId);
    if (state?.connection) {
      state.connection.destroy();
      state.connection = null;
      state.player.stop(true);
    }
  } else if (orchestratorJoined || orchestratorMoved) {
    // Orchestrator joined/moved - follow
    const channelId = newState.channelId!;
    log.info(`Orchestrator joined channel ${channelId} in guild ${guildId}, following...`);

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
      selfDeaf: false,
    });

    state.connection = connection;

    connection.subscribe(state.player);

    // Auto-rejoin on disconnect (network issues only)
    connection.on(VoiceConnectionStatus.Disconnected, async () => {
      try {
        await Promise.race([
          entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
          entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
        ]);
      } catch {
        log.warn(`Connection lost in guild ${guildId}`);
        connection.destroy();
        state.connection = null;
      }
    });
  }
});

client.once(Events.ClientReady, () => {
  log.info(`Ready as ${client.user?.tag}`);
  log.info(`Auto-follow enabled for orchestrator: ${ORCHESTRATOR_BOT_ID}`);

  // Start HTTP server
  startServer();

  void registerWithOrchestrator();
});

client.on('error', (error) => {
  logErrorWithStack('Client error', error);
});

if (hasToken) {
  client.login(TOKEN);
} else {
  log.warn('Bot token missing; running in degraded mode (HTTP only)');
  startServer();
}
