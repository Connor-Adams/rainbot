import { createDiscordWorker } from '@utils/discordWorker.ts';
import { loadConfig } from '@utils/config.ts';
import { createLogger } from '@utils/logger.ts';
import {
  joinVoiceChannel,
  entersState,
  VoiceConnectionStatus,
  AudioPlayer,
} from 'npm:@discordjs/voice@0.17.0';
import { createWorkerServer } from '@utils/workerServer.ts';
import { Client, GatewayIntentBits, Events } from 'npm:discord.js@14.14.1';
import { join } from '@std/path';

const log = createLogger('HUNGERBOT');

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
} catch {
  // .env not found, assume env vars are set
}

// Config
const { token, dashboardPort } = loadConfig();

const orchestratorBotId = Deno.env.get('ORCHESTRATOR_BOT_ID');

// State
type GuildState = {
  connection: any;
  userPlayers: Map<string, AudioPlayer>;
  volume: number;
};
const guildStates: Map<string, GuildState> = new Map();
let discordReady = false;

log.info(`Token ${token ? 'present' : 'missing'}`);

if (!token || token.startsWith('test_')) {
  log.warn('No valid token provided - running in worker-only mode (no Discord client)');
} else {
  createDiscordWorker({
    token: token,
    orchestratorBotId,
    autoFollowOrchestrator: true,
    onReady: (client: any) => {
      discordReady = true;
      log.info(`Ready as ${client.user?.tag}`, {
        username: client.user?.tag,
        userId: client.user?.id,
      });
      log.info(`Auto-follow enabled for orchestrator: ${orchestratorBotId}`, {
        orchestratorBotId,
      });
    },
    onError: (err: any) => {
      log.error('Discord client error', {
        error: err.message,
        stack: err.stack,
      });
    },
    getGuildState: getOrCreateGuildState,
    joinVoiceChannel: (guildId: string, channelId: string) => {
      const guild = client.guilds.cache.get(guildId);
      const channel = guild?.channels.cache.get(channelId);
      if (!guild || !channel || !channel.isVoiceBased()) return;
      const state = getOrCreateGuildState(guildId);
      if (state.connection) {
        state.connection.destroy();
      }
      const connection = joinVoiceChannel({
        channelId,
        guildId,
        adapterCreator: guild.voiceAdapterCreator as any,
      });
      state.connection = connection;
      state.userPlayers.forEach((player) => {
        connection.subscribe(player);
      });
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
    },
  });
}

/* =========================
   Helpers
========================= */

function getOrCreateGuildState(guildId: string) {
  if (!guildStates.has(guildId)) {
    guildStates.set(guildId, {
      connection: null,
      userPlayers: new Map(),
      volume: 0.7,
    });
  }
  return guildStates.get(guildId)!;
}

/* =========================
   Express Server
========================= */

// Use shared worker server utility for health endpoints and server startup
createWorkerServer({
  port: typeof dashboardPort === 'string' ? parseInt(dashboardPort, 10) : dashboardPort,
  healthReady: () => discordReady,
  readyInfo: () => ({ botType: 'hungerbot' }),
});

/* =========================
   Discord Client
========================= */

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
});

client.once('ready', () => {
  discordReady = true;
  log.info(`Ready as ${client.user?.tag}`, {
    username: client.user?.tag,
    userId: client.user?.id,
  });
  log.info(`Auto-follow enabled for orchestrator: ${orchestratorBotId}`, {
    orchestratorBotId,
  });
});

client.on('error', (err) => {
  log.error('Discord client error', {
    error: err.message,
    stack: err.stack,
  });
});

/* =========================
   Auto-follow Orchestrator
========================= */

client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
  if (newState.member?.id !== orchestratorBotId && oldState.member?.id !== orchestratorBotId) {
    return;
  }

  const guildId = newState.guild?.id || oldState.guild?.id;
  if (!guildId) return;

  const orchestratorLeft = oldState.channelId && !newState.channelId;
  const orchestratorJoined = !oldState.channelId && newState.channelId;
  const orchestratorMoved =
    oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId;

  const state = getOrCreateGuildState(guildId);

  if (orchestratorLeft) {
    if (state.connection) {
      state.connection.destroy();
      state.connection = null;
      state.userPlayers.clear();
    }
    return;
  }

  if (orchestratorJoined || orchestratorMoved) {
    const channelId = newState.channelId!;
    const guild = client.guilds.cache.get(guildId);
    const channel = guild?.channels.cache.get(channelId);

    if (!guild || !channel || !channel.isVoiceBased()) return;

    if (state.connection) {
      state.connection.destroy();
    }

    const connection = joinVoiceChannel({
      channelId,
      guildId,
      adapterCreator: (guild as any).voiceAdapterCreator,
    });

    state.connection = connection;

    state.userPlayers.forEach((player) => {
      connection.subscribe(player);
    });

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
  client.login(token);
} else {
  log.warn('Discord login skipped (no valid token)');
}
