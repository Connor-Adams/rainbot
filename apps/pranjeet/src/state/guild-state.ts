import {
  createAudioPlayer,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  type AudioResource,
} from '@discordjs/voice';
import type { StatusResponse } from '@rainbot/worker-protocol';
import type { PlaybackState } from '@rainbot/types/media';
import { logErrorWithStack } from '@rainbot/worker-shared';
import type { GuildState } from '@rainbot/worker-shared';
import { log } from '../config';

export interface PranjeetGuildState extends GuildState {
  volume: number;
  speakQueue: Promise<void>;
  lastSpeakAt: number;
  lastSpeakKey: string;
  /** Current TTS resource so volume changes apply to live playback */
  currentResource?: AudioResource<unknown> | null;
}

export const guildStates = new Map<string, PranjeetGuildState>();

export function getOrCreateGuildState(guildId: string): PranjeetGuildState {
  if (!guildStates.has(guildId)) {
    const player = createAudioPlayer();
    player.on('error', (error) => {
      logErrorWithStack(log, `Player error in guild ${guildId}`, error);
    });
    guildStates.set(guildId, {
      connection: null,
      player,
      volume: 0.8,
      speakQueue: Promise.resolve(),
      lastSpeakAt: 0,
      lastSpeakKey: '',
    });
  }
  return guildStates.get(guildId)!;
}

export function buildPlaybackState(state: PranjeetGuildState | null): PlaybackState {
  if (!state) {
    return { status: 'idle' };
  }
  let status: PlaybackState['status'] = 'idle';
  if (state.player.state.status === AudioPlayerStatus.Paused) {
    status = 'paused';
  } else if (state.player.state.status === AudioPlayerStatus.Playing) {
    status = 'playing';
  }
  return {
    status,
    volume: state.volume,
  };
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
