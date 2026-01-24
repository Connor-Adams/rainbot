import { Client, Events, VoiceState } from 'discord.js';
import {
  joinVoiceChannel,
  entersState,
  VoiceConnectionStatus,
  VoiceConnection,
  AudioPlayer,
} from '@discordjs/voice';
import { createLogger } from '@rainbot/shared';

export interface GuildState {
  connection: VoiceConnection | null;
  player: AudioPlayer;
  [key: string]: unknown;
}

export interface AutoFollowOptions {
  orchestratorBotId: string;
  guildStates: Map<string, GuildState>;
  getOrCreateGuildState: (guildId: string) => GuildState;
  logger?: ReturnType<typeof createLogger>;
}

/**
 * Setup auto-follow voice state handler to follow the orchestrator bot
 */
export function setupAutoFollowVoiceStateHandler(client: Client, options: AutoFollowOptions): void {
  const {
    orchestratorBotId,
    guildStates,
    getOrCreateGuildState,
    logger = createLogger('VOICE-STATE'),
  } = options;

  client.on(Events.VoiceStateUpdate, async (oldState: VoiceState, newState: VoiceState) => {
    // Only care about the orchestrator bot
    if (newState.member?.id !== orchestratorBotId && oldState.member?.id !== orchestratorBotId) {
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
      logger.info(`Orchestrator left voice in guild ${guildId}, following...`);
      const state = guildStates.get(guildId);
      if (state?.connection) {
        state.connection.destroy();
        state.connection = null;
      }
    } else if (orchestratorJoined || orchestratorMoved) {
      // Orchestrator joined/moved - follow
      const channelId = newState.channelId!;
      logger.info(`Orchestrator joined channel ${channelId} in guild ${guildId}, following...`);

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

      connection.subscribe(state.player);
      state.connection = connection;

      // Auto-rejoin on disconnect (network issues only)
      connection.on(VoiceConnectionStatus.Disconnected, async () => {
        try {
          await Promise.race([
            entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
            entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
          ]);
          // Connection recovered
        } catch (_error) {
          // Connection destroyed
          logger.warn(`Connection lost in guild ${guildId}`);
          connection.destroy();
          state.connection = null;
        }
      });
    }
  });
}
