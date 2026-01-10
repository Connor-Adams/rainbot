import { Client, GatewayIntentBits, Events, ClientOptions } from 'discord.js';
import { createLogger } from './logger.ts';

const log = createLogger('DiscordWorker');

export interface DiscordWorkerOptions {
  token: string;
  orchestratorBotId?: string;
  onReady?: (client: Client) => void;
  onError?: (err: Error) => void;
  autoFollowOrchestrator?: boolean;
  getGuildState?: (guildId: string) => any;
  joinVoiceChannel?: (guildId: string, channelId: string) => void;
  clientOptions?: ClientOptions;
}

/**
 * Bootstraps a Discord.js client for a worker bot, with error handling and optional orchestrator auto-follow.
 * Usage: import { createDiscordWorker } from 'utils/discordWorker';
 */
export function createDiscordWorker({
  token,
  orchestratorBotId,
  onReady,
  onError,
  autoFollowOrchestrator = false,
  getGuildState,
  joinVoiceChannel,
  clientOptions = { intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates] },
}: DiscordWorkerOptions) {
  const client = new Client(clientOptions);

  client.once('ready', () => {
    if (onReady) onReady(client);
  });

  client.on('error', (err) => {
    if (onError) onError(err);
  });

  if (autoFollowOrchestrator && orchestratorBotId && getGuildState && joinVoiceChannel) {
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
      const state = getGuildState(guildId);
      if (orchestratorLeft) {
        if (state.connection) {
          state.connection.destroy();
          state.connection = null;
          if (state.userPlayers) state.userPlayers.clear();
        }
        return;
      }
      if (orchestratorJoined || orchestratorMoved) {
        const channelId = newState.channelId!;
        joinVoiceChannel(guildId, channelId);
      }
    });
  }

  if (token) {
    client.login(token);
  } else {
    log.warn('Discord login skipped (no token)');
  }

  return client;
}
