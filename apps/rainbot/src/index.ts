import { createDiscordWorker } from '@utils/discordWorker.ts';
import { loadConfig } from '@utils/config.ts';
import { createWorkerServer } from '@utils/workerServer.ts';
import { Client, GatewayIntentBits } from 'npm:discord.js@14.15.3';
import {
  joinVoiceChannel,
  createAudioPlayer,
  entersState,
  VoiceConnectionStatus,
} from 'npm:@discordjs/voice@0.17.0';
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
  console.log('[RAINBOT] Environment variables loaded successfully');
} catch (error) {
  console.warn('[RAINBOT] Failed to load .env file:', error);
}

console.log('[RAINBOT] RAINBOT_TOKEN present:', !!Deno.env.get('RAINBOT_TOKEN'));
console.log('[RAINBOT] Current working directory:', Deno.cwd());

const { token, dashboardPort, requiredRoleId, clientId, guildId } = loadConfig();
const PORT = typeof dashboardPort === 'string' ? parseInt(dashboardPort, 10) : dashboardPort;
const ORCHESTRATOR_BOT_ID = requiredRoleId || clientId || guildId;
let discordReady = false;

type GuildState = {
  connection: any;
  player: any;
  queue: any[];
  currentTrack: any;
  volume: number;
  userPlayers?: Map<string, any>;
};
const guildStates: Map<string, GuildState> = new Map();
function getOrCreateGuildState(guildId: string): GuildState {
  if (!guildStates.has(guildId)) {
    guildStates.set(guildId, {
      connection: null,
      player: createAudioPlayer(),
      queue: [],
      currentTrack: null,
      volume: 1,
      userPlayers: new Map(),
    });
  }
  return guildStates.get(guildId)!;
}

console.log(`[RAINBOT] Loaded token: ${token ? 'present' : 'missing'}`);

if (!token || token.startsWith('test_')) {
  console.warn(
    '[RAINBOT] No valid token provided - running in worker-only mode (no Discord client)'
  );
  // createDiscordWorker({
  //   token: token,
  //   orchestratorBotId: ORCHESTRATOR_BOT_ID,
  //   autoFollowOrchestrator: true,
  //   onReady: (client) => {
  //     discordReady = true;
  //     console.log(`[RAINBOT] Ready as ${client.user?.tag}`);
  //     console.log(`[RAINBOT] Auto-follow enabled for orchestrator: ${ORCHESTRATOR_BOT_ID}`);
  //   },
  //   onError: (err) => {
  //     console.error('[RAINBOT] Client error:', err);
  //   },
  //   getGuildState: getOrCreateGuildState,
  //   joinVoiceChannel: (guildId: string, channelId: string) => {
  //     const client = new Client({
  //       intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
  //     });
  //     const guild = client.guilds.cache.get(guildId);
  //     const channel = guild?.channels.cache.get(channelId);
  //     if (!guild || !channel || !channel.isVoiceBased()) return;
  //     const state = getOrCreateGuildState(guildId);
  //     if (state.connection) {
  //       state.connection.destroy();
  //     }
  //     const connection = joinVoiceChannel({
  //       channelId,
  //       guildId,
  //       adapterCreator: guild.voiceAdapterCreator as any,
  //     });
  //     state.connection = connection;
  //     state.userPlayers?.forEach?.((player) => {
  //       connection.subscribe(player);
  //     });
  //     connection.on(VoiceConnectionStatus.Disconnected, async () => {
  //       try {
  //         await Promise.race([
  //           entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
  //           entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
  //         ]);
  //       } catch {
  //         connection.destroy();
  //         state.connection = null;
  //       }
  //     });
  //   },
  // });
} else {
  createDiscordWorker({
    token: token,
    orchestratorBotId: ORCHESTRATOR_BOT_ID,
    autoFollowOrchestrator: true,
    onReady: (client) => {
      discordReady = true;
      console.log(`[RAINBOT] Ready as ${client.user?.tag}`);
      console.log(`[RAINBOT] Auto-follow enabled for orchestrator: ${ORCHESTRATOR_BOT_ID}`);
    },
    onError: (err) => {
      console.error('[RAINBOT] Client error:', err);
    },
    getGuildState: getOrCreateGuildState,
    joinVoiceChannel: (guildId: string, channelId: string) => {
      const client = new Client({
        intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
      });
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
      state.userPlayers?.forEach?.((player) => {
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

createWorkerServer({
  port: PORT,
  healthReady: () => discordReady,
  readyInfo: () => ({ botType: 'rainbot' }),
});
