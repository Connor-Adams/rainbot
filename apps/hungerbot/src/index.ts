import { Client, Events } from 'discord.js';
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
import { Request, Response } from 'express';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { Readable } from 'stream';
import * as fs from 'fs';
import * as path from 'path';
import { createLogger } from '@rainbot/shared';
import {
  setupProcessErrorHandlers,
  logErrorWithStack,
} from '@rainbot/worker-shared';
import {
  getOrchestratorBaseUrl,
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

interface HungerbotGuildState extends GuildState {
  volume: number;
}

const guildStates = new Map<string, HungerbotGuildState>();
const requestCache = new RequestCache();
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
            logErrorWithStack(log, `S3 fetch failed for ${oggFilename}`, error);
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
      logErrorWithStack(log, `S3 fetch failed for ${filename}`, error);
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

function getOrCreateGuildState(guildId: string): HungerbotGuildState {
  if (!guildStates.has(guildId)) {
    const player = createAudioPlayer();
    player.on('error', (error) => {
      logErrorWithStack(log, `Player error in guild ${guildId}`, error);
    });

    guildStates.set(guildId, {
      connection: null,
      player,
      volume: 0.7,
    });
  }
  return guildStates.get(guildId)!;
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
      return res.status(404).json(response);
    }

    const channel = guild.channels.cache.get(channelId);
    if (!channel || !channel.isVoiceBased()) {
      const response = { status: 'error', message: 'Voice channel not found' };
      requestCache.set(requestId, response);
      return res.status(404).json(response);
    }

    const state = getOrCreateGuildState(guildId);

    if (state.connection && state.connection.state.status !== VoiceConnectionStatus.Destroyed) {
      const response = { status: 'already_connected', channelId };
      requestCache.set(requestId, response);
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
    return res.json(response);
  }

  state.connection.destroy();
  state.connection = null;
  state.player.stop();

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
      return res.status(400).json(response);
    }

    const inputType = getSoundInputType(sfxId);
    const soundStream = await getSoundStream(sfxId);
    const resource = createAudioResource(soundStream, {
      inputType,
      inlineVolume: true,
    });

    const effectiveVolume = volume !== undefined ? volume : state.volume;
    if (resource.volume) {
      resource.volume.setVolume(effectiveVolume);
    }

    log.debug(
      `Soundboard volume=${effectiveVolume} inputType=${inputType} connected=${state.connection.state.status} player=${state.player.state.status}`
    );

    // Play immediately (interrupt any current sound)
    state.player.stop(true);
    state.player.play(resource);
    log.debug(`Soundboard play issued status=${state.player.state.status}`);

    log.info(`Playing sound ${sfxId} for user ${userId} in guild ${guildId}`);
    void reportSoundStat(
      {
        soundName: sfxId,
        userId,
        guildId,
        sourceType: 'local',
        isSoundboard: true,
        duration: null,
        source: 'discord',
      },
      { logger: log }
    );

    const response = { status: 'success', message: 'Sound playing' };
    requestCache.set(requestId, response);
    res.json(response);
  } catch (error) {
    logErrorWithStack(log, 'Play sound error', error);
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

// Extend voice state handler for hungerbot-specific cleanup (stop player on leave)
client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
  // Check if this is orchestrator auto-follow (handled by setupAutoFollowVoiceStateHandler)
  if (newState.member?.id === ORCHESTRATOR_BOT_ID || oldState.member?.id === ORCHESTRATOR_BOT_ID) {
    const guildId = newState.guild?.id || oldState.guild?.id;
    if (!guildId) return;

    const orchestratorLeft = oldState.channelId && !newState.channelId;
    if (orchestratorLeft) {
      // Additional hungerbot-specific cleanup
      const state = guildStates.get(guildId);
      if (state?.connection) {
        state.player.stop(true);
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
      botType: 'hungerbot',
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
