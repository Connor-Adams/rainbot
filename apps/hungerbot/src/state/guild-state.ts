import { createAudioPlayer, AudioPlayerStatus, VoiceConnectionStatus } from '@discordjs/voice';
import type { StatusResponse } from '@rainbot/worker-protocol';
import { logErrorWithStack } from '@rainbot/worker-shared';
import type { GuildState } from '@rainbot/worker-shared';
import { log } from '../config';

export interface HungerbotGuildState extends GuildState {
  volume: number;
}

export const guildStates = new Map<string, HungerbotGuildState>();

export function getOrCreateGuildState(guildId: string): HungerbotGuildState {
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

export function getStateForRpc(input?: { guildId?: string }): StatusResponse {
  const guildId = input?.guildId;
  if (guildId) {
    const state = guildStates.get(guildId);
    if (!state) {
      return { connected: false, playing: false };
    }
    const connected =
      !!state.connection && state.connection.state.status !== VoiceConnectionStatus.Destroyed;
    const playing = state.player.state.status === AudioPlayerStatus.Playing;
    const channelId = state.connection?.joinConfig?.channelId;
    return {
      connected,
      playing,
      channelId: channelId ?? undefined,
      volume: state.volume,
    };
  }
  return { connected: false, playing: false };
}
