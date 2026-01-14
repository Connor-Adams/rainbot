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
import { Readable } from 'stream';
import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';

const PORT = parseInt(process.env['PRANJEET_PORT'] || '3002', 10);
const TOKEN = process.env['PRANJEET_TOKEN'];
const TTS_API_KEY = process.env['TTS_API_KEY'] || process.env['OPENAI_API_KEY'];
const TTS_PROVIDER = process.env['TTS_PROVIDER'] || 'openai';
const TTS_VOICE = process.env['TTS_VOICE_NAME'] || 'alloy';
const ORCHESTRATOR_BOT_ID = process.env['ORCHESTRATOR_BOT_ID'] || process.env['RAINCLOUD_BOT_ID'];
const REDIS_URL = process.env['REDIS_URL'];

const hasToken = !!TOKEN;
const hasOrchestrator = !!ORCHESTRATOR_BOT_ID;

function formatError(err: unknown): { message: string; stack?: string } {
  if (err instanceof Error) {
    return { message: err.message, stack: err.stack };
  }
  return { message: String(err) };
}

process.on('unhandledRejection', (reason) => {
  const info = formatError(reason);
  console.error(`[PRANJEET] Unhandled promise rejection: ${info.message}`);
  if (info.stack) console.error(info.stack);
});

process.on('uncaughtException', (error) => {
  const info = formatError(error);
  console.error(`[PRANJEET] Uncaught exception: ${info.message}`);
  if (info.stack) console.error(info.stack);
  process.exitCode = 1;
});

console.log(`[PRANJEET] Starting (pid=${process.pid}, node=${process.version})`);
console.log(
  `[PRANJEET] Config: port=${PORT}, hasToken=${hasToken}, hasOrchestrator=${hasOrchestrator}, ttsProvider=${TTS_PROVIDER}`
);

if (!hasToken) {
  console.error('PRANJEET_TOKEN environment variable is required');
}

if (!hasOrchestrator) {
  console.error('ORCHESTRATOR_BOT_ID environment variable is required for auto-follow');
}

interface GuildState {
  connection: VoiceConnection | null;
  player: AudioPlayer;
  volume: number;
}

const guildStates = new Map<string, GuildState>();
const requestCache = new Map<string, unknown>();
let queueReady = false;
let serverStarted = false;

function startServer(): void {
  if (serverStarted) return;
  serverStarted = true;
  app.listen(PORT, () => {
    console.log(`[PRANJEET] Worker server listening on port ${PORT}`);
  });
}

function ensureClientReady(res: Response): boolean {
  if (!client.isReady()) {
    res.status(503).json({ status: 'error', message: 'Bot not ready' });
    return false;
  }
  return true;
}

// TTS Provider interface
let ttsClient: any = null;

// Initialize TTS client
async function initTTS(): Promise<void> {
  if (TTS_PROVIDER === 'openai' && TTS_API_KEY) {
    try {
      const { OpenAI } = await import('openai');
      ttsClient = new OpenAI({ apiKey: TTS_API_KEY });
      console.log('[PRANJEET] OpenAI TTS client initialized');
    } catch (error) {
      console.error('[PRANJEET] Failed to initialize OpenAI TTS:', error);
    }
  } else if (TTS_PROVIDER === 'google' && TTS_API_KEY) {
    try {
      const textToSpeech = await import('@google-cloud/text-to-speech');
      ttsClient = new textToSpeech.TextToSpeechClient({ apiKey: TTS_API_KEY });
      console.log('[PRANJEET] Google TTS client initialized');
    } catch (error) {
      console.error('[PRANJEET] Failed to initialize Google TTS:', error);
    }
  } else {
    console.warn('[PRANJEET] No TTS API key configured - TTS will not work');
  }
}

function getOrCreateGuildState(guildId: string): GuildState {
  if (!guildStates.has(guildId)) {
    const player = createAudioPlayer();

    player.on('error', (error) => {
      console.error(`[PRANJEET] Player error in guild ${guildId}:`, error);
    });

    guildStates.set(guildId, {
      connection: null,
      player,
      volume: 0.8,
    });
  }
  return guildStates.get(guildId)!;
}

/**
 * Generate TTS audio using configured provider
 */
async function generateTTS(text: string, voice?: string): Promise<Buffer> {
  console.log(`[PRANJEET] Generating TTS for: "${text.substring(0, 50)}..."`);

  if (!ttsClient) {
    console.error('[PRANJEET] TTS client not initialized');
    throw new Error('TTS not configured');
  }

  if (TTS_PROVIDER === 'openai') {
    return generateOpenAITTS(text, voice);
  } else if (TTS_PROVIDER === 'google') {
    return generateGoogleTTS(text, voice);
  }

  throw new Error(`Unsupported TTS provider: ${TTS_PROVIDER}`);
}

async function speakInGuild(
  guildId: string,
  text: string,
  voice?: string
): Promise<{ status: 'success' | 'error'; message: string }> {
  const state = getOrCreateGuildState(guildId);

  if (!state.connection) {
    return { status: 'error', message: 'Not connected to voice channel' };
  }

  const audioBuffer = await generateTTS(text, voice);
  const stream = Readable.from(audioBuffer);
  const resource = createAudioResource(stream, {
    inputType: StreamType.Arbitrary,
    inlineVolume: true,
  });

  if (resource.volume) {
    resource.volume.setVolume(state.volume);
  }

  state.player.play(resource);
  return { status: 'success', message: 'TTS queued' };
}

/**
 * Generate TTS using OpenAI
 */
async function generateOpenAITTS(text: string, voice?: string): Promise<Buffer> {
  const validVoices = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];
  const voiceName = voice || TTS_VOICE;
  const selectedVoice = validVoices.includes(voiceName) ? voiceName : 'alloy';

  const response = await ttsClient.audio.speech.create({
    model: 'tts-1',
    voice: selectedVoice as 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer',
    input: text,
    response_format: 'pcm',
    speed: 1.0,
  });

  // OpenAI returns PCM audio at 24kHz, resample to 48kHz for Discord
  const pcm24k = Buffer.from(await response.arrayBuffer());
  return resample24to48(pcm24k);
}

/**
 * Generate TTS using Google Cloud
 */
async function generateGoogleTTS(text: string, voice?: string): Promise<Buffer> {
  const ttsRequest = {
    input: { text },
    voice: {
      languageCode: 'en-US',
      name: voice || TTS_VOICE || 'en-US-Neural2-J',
    },
    audioConfig: {
      audioEncoding: 'LINEAR16' as const,
      sampleRateHertz: 48000,
    },
  };

  const [response] = await ttsClient.synthesizeSpeech(ttsRequest);

  if (!response.audioContent) {
    throw new Error('No audio content in TTS response');
  }

  return Buffer.from(response.audioContent);
}

/**
 * Resample 24kHz PCM to 48kHz PCM (2x upsampling)
 */
function resample24to48(pcm24k: Buffer): Buffer {
  const samples24k = pcm24k.length / 2; // 16-bit = 2 bytes per sample
  const pcm48k = Buffer.alloc(samples24k * 4); // 2x samples, 2 bytes each

  for (let i = 0; i < samples24k; i++) {
    const sample = pcm24k.readInt16LE(i * 2);
    // Write each sample twice for 2x upsampling
    pcm48k.writeInt16LE(sample, i * 4);
    pcm48k.writeInt16LE(sample, i * 4 + 2);
  }

  return pcm48k;
}

// Express server for worker protocol
const app = express();
app.use(express.json());

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
    });

    connection.subscribe(state.player);
    state.connection = connection;

    // Auto-rejoin on disconnect
    connection.on(VoiceConnectionStatus.Disconnected, async () => {
      try {
        await Promise.race([
          entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
          entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
        ]);
      } catch (_error) {
        console.log(`[PRANJEET] Connection lost in guild ${guildId}, attempting rejoin...`);
        connection.destroy();
        state.connection = null;
      }
    });

    const response = { status: 'joined', channelId };
    requestCache.set(requestId, response);
    setTimeout(() => requestCache.delete(requestId), 60000);
    res.json(response);
  } catch (error) {
    console.error('[PRANJEET] Join error:', error);
    const response = { status: 'error', message: (error as Error).message };
    res.status(500).json(response);
  }
});

// Leave voice channel (Pranjeet stays connected unless explicitly told to leave)
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
    volume: state.volume,
  });
});

// Speak TTS
app.post('/speak', async (req: Request, res: Response) => {
  const { requestId, guildId, text, voice, speed: _speed } = req.body;

  if (!requestId || !guildId || !text) {
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
    const response = await speakInGuild(guildId, text, voice);
    if (response.status === 'error') {
      requestCache.set(requestId, response);
      setTimeout(() => requestCache.delete(requestId), 60000);
      return res.status(400).json(response);
    }

    console.log(`[PRANJEET] Speaking in guild ${guildId}: ${text}`);

    requestCache.set(requestId, response);
    setTimeout(() => requestCache.delete(requestId), 60000);
    res.json(response);
  } catch (error) {
    console.error('[PRANJEET] Speak error:', error);
    const response = { status: 'error', message: (error as Error).message };
    res.status(500).json(response);
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
    botType: 'pranjeet',
    ready: hasToken && client.isReady(),
    degraded: !hasToken,
    queueReady,
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
    console.log(`[PRANJEET] Orchestrator left voice in guild ${guildId}, following...`);
    const state = guildStates.get(guildId);
    if (state?.connection) {
      state.connection.destroy();
      state.connection = null;
    }
  } else if (orchestratorJoined || orchestratorMoved) {
    // Orchestrator joined/moved - follow
    const channelId = newState.channelId!;
    console.log(
      `[PRANJEET] Orchestrator joined channel ${channelId} in guild ${guildId}, following...`
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
        console.log(`[PRANJEET] Connection lost in guild ${guildId}`);
        connection.destroy();
        state.connection = null;
      }
    });
  }
});

client.once('ready', async () => {
  console.log(`[PRANJEET] Ready as ${client.user?.tag}`);
  console.log(`[PRANJEET] Auto-follow enabled for orchestrator: ${ORCHESTRATOR_BOT_ID}`);

  // Initialize TTS client
  await initTTS();

  // Start HTTP server
  startServer();

  if (REDIS_URL) {
    try {
      const connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });
      const worker = new Worker(
        'tts',
        async (job) => {
          if (!hasToken || !client.isReady()) {
            throw new Error('Bot not ready');
          }
          const { guildId, text, voice } = job.data as {
            guildId: string;
            text: string;
            voice?: string;
          };
          const result = await speakInGuild(guildId, text, voice);
          if (result.status === 'error') {
            throw new Error(result.message);
          }
          return { status: 'success' };
        },
        { connection, concurrency: 1 }
      );

      worker.on('failed', (job, err) => {
        console.error(`[PRANJEET] TTS job failed ${job?.id}: ${err.message}`);
      });

      queueReady = true;
      console.log('[PRANJEET] TTS queue worker started');
    } catch (error) {
      console.error('[PRANJEET] Failed to start TTS queue worker:', error);
      queueReady = false;
    }
  }
});

client.on('error', (error) => {
  console.error('[PRANJEET] Client error:', error);
});

if (hasToken) {
  client.login(TOKEN);
} else {
  console.warn('[PRANJEET] Bot token missing; running in degraded mode (HTTP only)');
  startServer();
}
