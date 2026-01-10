import { createDiscordWorker } from '@utils/discordWorker.ts';
import { loadConfig } from '@utils/config.ts';
import { createWorkerServer } from '@utils/workerServer.ts';
import { Client, GatewayIntentBits, Events } from 'npm:discord.js@14.15.3';
import { joinVoiceChannel, entersState, VoiceConnectionStatus } from 'npm:@discordjs/voice@0.17.0';
import OpenAI from 'npm:openai@4.104.0';
import { join } from '@std/path';

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
  console.warn('[PRANJEET] Failed to load .env file:', error);
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
  console.warn('[PRANJEET] Test API key provided - TTS functionality disabled');
}

/* =========================
   TTS
========================= */

async function initTTS(): Promise<void> {
  if (TTS_PROVIDER === 'openai' && TTS_API_KEY) {
    const { OpenAI } = await import('openai');
    ttsClient = new OpenAI({ apiKey: TTS_API_KEY });
    console.log('[PRANJEET] OpenAI TTS initialized');
  } else {
    console.warn('[PRANJEET] No valid TTS provider configured');
  }
}

async function generateTTS(text: string, voice?: string): Promise<Buffer> {
  if (!ttsClient) throw new Error('TTS not initialized');

  try {
    console.log(`[PRANJEET] Generating TTS for text: "${text.substring(0, 50)}..."`);
    const response = await ttsClient.audio.speech.create({
      model: 'tts-1',
      voice: (voice || TTS_VOICE) as any,
      input: text,
      response_format: 'pcm',
    });

    const pcm24k = Buffer.from(await response.arrayBuffer());
    const resampled = resample24to48(pcm24k);
    console.log(`[PRANJEET] TTS generated successfully, length: ${resampled.length} bytes`);
    return resampled;
  } catch (error) {
    console.error('[PRANJEET] TTS generation failed:', error);
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
  console.log(`[PRANJEET] Ready as ${client.user?.tag}`);
  console.log(`[PRANJEET] Auto-follow enabled for orchestrator: ${ORCHESTRATOR_BOT_ID}`);
  await initTTS();
});

client.on('error', (err) => {
  console.error('[PRANJEET] Client error:', err);
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
    console.error('[PRANJEET] Failed to login:', error instanceof Error ? error.message : error);
  }
} else {
  console.warn('[PRANJEET] Discord login skipped (no valid token)');
}
