import {
  AudioPlayerStatus,
  type AudioResource,
  createAudioPlayer,
  VoiceConnectionStatus,
} from '@discordjs/voice';
import type { PlaybackState, QueueState, Track } from '@rainbot/protocol';
import type { StatusResponse } from '@rainbot/worker-protocol';
import { logErrorWithStack, reportSoundStat, type GuildState } from '@rainbot/worker-shared';
import { createTrackResourceForAny } from '../voice/audioResource';
import { log } from '../config';

export interface RainbotGuildState extends GuildState {
  queue: Track[];
  currentTrack: Track | null;
  currentResource: AudioResource | null;
  lastPlayedTrack: Track | null;
  nowPlaying: string | null;
  playbackStartTime: number | null;
  pauseStartTime: number | null;
  totalPausedTime: number;
  autoplay: boolean;
  /** 0-1 scale */
  volume: number;
  lastPlaybackError: string | null;
}

export const guildStates = new Map<string, RainbotGuildState>();

export function getOrCreateGuildState(guildId: string): RainbotGuildState {
  const existing = guildStates.get(guildId);
  if (existing) return existing;

  const player = createAudioPlayer();

  player.on(AudioPlayerStatus.Idle, () => {
    const state = guildStates.get(guildId);
    if (!state) return;
    if (state.queue.length > 0) {
      void playNext(guildId);
    } else {
      state.nowPlaying = null;
      state.currentTrack = null;
      state.currentResource = null;
      state.playbackStartTime = null;
      state.pauseStartTime = null;
      state.totalPausedTime = 0;
    }
  });

  player.on('error', (error) => {
    const state = guildStates.get(guildId);
    if (state) state.lastPlaybackError = error.message;
    log.error(`Player error in guild ${guildId}: ${error.message}`);
    if (error.stack) {
      log.debug(error.stack);
    }
  });

  const state: RainbotGuildState = {
    connection: null,
    player,
    queue: [],
    currentTrack: null,
    currentResource: null,
    lastPlayedTrack: null,
    volume: 1,
    nowPlaying: null,
    playbackStartTime: null,
    pauseStartTime: null,
    totalPausedTime: 0,
    autoplay: false,
    lastPlaybackError: null,
  };
  guildStates.set(guildId, state);
  return state;
}

export function resetPlaybackTiming(state: RainbotGuildState): void {
  state.playbackStartTime = Date.now();
  state.pauseStartTime = null;
  state.totalPausedTime = 0;
}

export function markPaused(state: RainbotGuildState): void {
  if (!state.pauseStartTime) {
    state.pauseStartTime = Date.now();
  }
}

export function markResumed(state: RainbotGuildState): void {
  if (state.pauseStartTime) {
    state.totalPausedTime += Date.now() - state.pauseStartTime;
    state.pauseStartTime = null;
  }
}

export function getPlaybackPosition(state: RainbotGuildState): number {
  if (!state.playbackStartTime || !state.currentTrack) {
    return 0;
  }
  const elapsed = Date.now() - state.playbackStartTime;
  const pausedTime = state.totalPausedTime;
  const currentPauseTime = state.pauseStartTime ? Date.now() - state.pauseStartTime : 0;
  let playbackPosition = Math.max(0, Math.floor((elapsed - pausedTime - currentPauseTime) / 1000));
  if (state.currentTrack.duration && playbackPosition > state.currentTrack.duration) {
    playbackPosition = state.currentTrack.duration;
  }
  return playbackPosition;
}

export function buildPlaybackState(state: RainbotGuildState | null): PlaybackState {
  if (!state) {
    return { status: 'idle' };
  }
  let status: PlaybackState['status'] = 'idle';
  if (state.player.state.status === AudioPlayerStatus.Paused) {
    status = 'paused';
  } else if (state.player.state.status === AudioPlayerStatus.Playing) {
    status = 'playing';
  }
  const positionMs = getPlaybackPosition(state) * 1000;
  const durationMs =
    state.currentTrack?.durationMs ??
    (state.currentTrack?.duration ? state.currentTrack.duration * 1000 : undefined);

  return {
    status,
    positionMs: positionMs > 0 ? positionMs : undefined,
    durationMs,
    volume: state.volume,
  };
}

export function buildQueueState(
  state: RainbotGuildState | null,
  playback: PlaybackState
): QueueState {
  if (!state) {
    return { queue: [] };
  }
  return {
    nowPlaying: state.currentTrack || (state.nowPlaying ? { title: state.nowPlaying } : undefined),
    queue: state.queue,
    isPaused: playback.status === 'paused',
    isAutoplay: state.autoplay,
  };
}

export function getStateForRpc(input?: { guildId?: string }): StatusResponse {
  const guildId = input?.guildId;
  if (!guildId) {
    return { connected: false, playing: false };
  }
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
    queueLength: state.queue.length,
    volume: state.volume,
    lastPlaybackError: state.lastPlaybackError ?? undefined,
  };
}

export async function playNext(guildId: string): Promise<void> {
  const state = getOrCreateGuildState(guildId);

  if (state.queue.length === 0) {
    state.currentTrack = null;
    state.currentResource = null;
    state.nowPlaying = null;
    state.playbackStartTime = null;
    state.pauseStartTime = null;
    state.totalPausedTime = 0;
    return;
  }

  const track = state.queue.shift()!;
  state.currentTrack = track;
  state.lastPlayedTrack = track.url ? track : state.lastPlayedTrack;
  state.nowPlaying = track.title ?? null;

  try {
    log.info(
      `playNext title="${track.title}" url="${track.url}" sourceType=${track.sourceType || 'n/a'}`
    );
    const resource = await createTrackResourceForAny(track);

    if (resource.volume) {
      resource.volume.setVolume(state.volume);
    }

    state.currentResource = resource;
    resetPlaybackTiming(state);
    state.lastPlaybackError = null;
    state.player.play(resource);
    log.info(`Playing: ${track.title} in guild ${guildId}`);
    if (track.userId) {
      void reportSoundStat(
        {
          soundName: track.title ?? 'Unknown',
          userId: track.userId,
          guildId,
          sourceType: track.sourceType || 'other',
          isSoundboard: false,
          duration: track.duration ?? null,
          source: 'discord',
          username: track.username || null,
          discriminator: track.discriminator || null,
        },
        { logger: log }
      );
    }
  } catch (error) {
    state.lastPlaybackError = (error as Error).message;
    logErrorWithStack(log, 'Error playing track', error);
    await playNext(guildId);
  }
}
