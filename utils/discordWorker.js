'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.createDiscordWorker = createDiscordWorker;
const discord_js_1 = require('discord.js');
/**
 * Bootstraps a Discord.js client for a worker bot, with error handling and optional orchestrator auto-follow.
 * Usage: import { createDiscordWorker } from 'utils/discordWorker';
 */
function createDiscordWorker({
  token,
  orchestratorBotId,
  onReady,
  onError,
  autoFollowOrchestrator = false,
  getGuildState,
  joinVoiceChannel,
  clientOptions = {
    intents: [
      discord_js_1.GatewayIntentBits.Guilds,
      discord_js_1.GatewayIntentBits.GuildVoiceStates,
    ],
  },
}) {
  const client = new discord_js_1.Client(clientOptions);
  client.once('ready', () => {
    if (onReady) onReady(client);
  });
  client.on('error', (err) => {
    if (onError) onError(err);
  });
  if (autoFollowOrchestrator && orchestratorBotId && getGuildState && joinVoiceChannel) {
    client.on(discord_js_1.Events.VoiceStateUpdate, async (oldState, newState) => {
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
        const channelId = newState.channelId;
        joinVoiceChannel(guildId, channelId);
      }
    });
  }
  if (token) {
    client.login(token);
  } else {
    console.warn('[DiscordWorker] Discord login skipped (no token)');
  }
  return client;
}
//# sourceMappingURL=discordWorker.js.map
