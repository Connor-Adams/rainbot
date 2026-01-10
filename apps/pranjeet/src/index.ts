import { createDiscordWorker } from '@utils/discordWorker.ts';
import { loadConfig } from '@utils/config.ts';
import { createLogger } from '@utils/logger.ts';
import { createWorkerServer } from '@utils/workerServer.ts';
import { Client, GatewayIntentBits, Events } from 'npm:discord.js@14.14.1';
import { joinVoiceChannel, entersState, VoiceConnectionStatus } from 'npm:@discordjs/voice@0.17.0';
import OpenAI from 'npm:openai@4.104.0';
import { join } from '@std/path';
import { Buffer } from 'node:buffer';

const log = createLogger('PRANJEET');

// Load environment variables from root .env
// Deno automatically loads .env files, but for explicit loading:
const envPath = join(Deno.cwd(), '../../.env');
try {
  const envContent = await Deno.readTextFile(envPath);
  for (const line of envContent.split('\n')) {
    const [key, value] = line.split('=');
    if (key && value) {
      Deno.env.set(key.trim(), value.trim());
    }
  }
} catch (error) {
  log.warn('Failed to load .env file', { error: error.message });
}

const {
  token,
  ttsApiKey,
  ttsProvider,
  ttsVoiceName,
  requiredRoleId,
  clientId,
  guildId,
  dashboardPort,
} = loadConfig();
const PORT = dashboardPort || 3000;
const TTS_API_KEY = ttsApiKey;
const TTS_PROVIDER = ttsProvider || 'openai';
const TTS_VOICE = ttsVoiceName || 'alloy';
const ORCHESTRATOR_BOT_ID = requiredRoleId || clientId || guildId;

let discordReady = false;

type GuildState = {
  connection: any;
  player?: any;
};
const guildStates: Map<string, GuildState> = new Map();
function getOrCreateGuildState(guildId: string): GuildState {
  if (!guildStates.has(guildId)) {
    guildStates.set(guildId, { connection: null });
  }
  return guildStates.get(guildId)!;
}

let ttsClient: any = null;
if (TTS_API_KEY && !TTS_API_KEY.startsWith('test_')) {
  ttsClient = new OpenAI({ apiKey: TTS_API_KEY });
} else if (TTS_API_KEY?.startsWith('test_')) {
  log.warn('Test API key provided - TTS functionality disabled');
}

/* =========================
   TTS
========================= */

async function initTTS(): Promise<void> {
  if (TTS_PROVIDER === 'openai' && TTS_API_KEY) {
    const { OpenAI } = await import('openai');
    ttsClient = new OpenAI({ apiKey: TTS_API_KEY });
    log.info('OpenAI TTS initialized');
  } else {
    log.warn('No valid TTS provider configured');
  }
}

async function generateTTS(text: string, voice?: string): Promise<Buffer> {
  if (!ttsClient) {
    throw new Error('TTS not initialized');
  }

  try {
    log.debug(`Generating TTS for text: "${text.substring(0, 50)}..."`, {
      textLength: text.length,
      provider: TTS_PROVIDER,
    });
    const response = await ttsClient.audio.speech.create({
      model: 'tts-1',
      voice: (voice || TTS_VOICE) as any,
      input: text,
      response_format: 'pcm',
    });

    const pcm24k = Buffer.from(await response.arrayBuffer());
    const resampled = resample24to48(pcm24k);
    log.info(`TTS generated successfully, length: ${resampled.length} bytes`, {
      bytes: resampled.length,
      voice: voice || TTS_VOICE,
    });
    return resampled;
  } catch (error) {
    log.error('TTS generation failed', {
      error: error instanceof Error ? error.message : String(error),
      textLength: text.length,
    });
    throw error;
  }
}

function resample24to48(pcm24k: Buffer): Buffer {
  const samples = pcm24k.length / 2;
  const pcm48k = Buffer.alloc(samples * 4);

  for (let i = 0; i < samples; i++) {
    const s = pcm24k.readInt16LE(i * 2);
    pcm48k.writeInt16LE(s, i * 4);
    pcm48k.writeInt16LE(s, i * 4 + 2);
  }

  return pcm48k;
}

// Use shared worker server utility for health endpoints and server startup
createWorkerServer({
  port: typeof dashboardPort === 'string' ? parseInt(dashboardPort, 10) : dashboardPort,
  healthReady: () => discordReady,
  readyInfo: () => ({ botType: 'pranjeet' }),
});

/* =========================
   Discord Client
========================= */

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
});

client.once('ready', async () => {
  discordReady = true;
  log.info(`Ready as ${client.user?.tag}`, {
    username: client.user?.tag,
    userId: client.user?.id,
  });
  log.info(`Auto-follow enabled for orchestrator: ${ORCHESTRATOR_BOT_ID}`, {
    orchestratorBotId: ORCHESTRATOR_BOT_ID,
  });
  await initTTS();
});

client.on('error', (err) => {
  log.error('Client error', {
    error: err.message,
    stack: err.stack,
  });
});

/* =========================
   Auto-follow Orchestrator
========================= */

client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
  if (newState.member?.id !== ORCHESTRATOR_BOT_ID && oldState.member?.id !== ORCHESTRATOR_BOT_ID) {
    return;
  }

  const guildId = newState.guild?.id || oldState.guild?.id;
  if (!guildId) return;

  const state = getOrCreateGuildState(guildId);

  if (oldState.channelId && !newState.channelId) {
    state.connection?.destroy();
    state.connection = null;
    return;
  }

  if (
    (!oldState.channelId && newState.channelId) ||
    (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId)
  ) {
    const guild = client.guilds.cache.get(guildId);
    const channel = guild?.channels.cache.get(newState.channelId!);
    if (!guild || !channel || !channel.isVoiceBased()) return;

    state.connection?.destroy();

    const connection = joinVoiceChannel({
      channelId: channel.id,
      guildId,
      adapterCreator: guild.voiceAdapterCreator as any,
    });

    connection.subscribe(state.player);
    state.connection = connection;

    connection.on(VoiceConnectionStatus.Disconnected, async () => {
      try {
        await Promise.race([
          entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
          entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
        ]);
      } catch {
        connection.destroy();
        state.connection = null;
      }
    });
  }
});

/* =========================
   Login
========================= */

if (token && !token.startsWith('test_')) {
  try {
    client.login(token);
  } catch (error) {
    log.error('Failed to login', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
} else {
  log.warn('Discord login skipped (no valid token)');
}
