// util-category: audio
import { AudioPlayerStatus, AudioResource } from '@discordjs/voice';
import { Readable } from 'stream';

import { createLogger } from '../logger';
import { getVoiceState } from './connectionManager';

import { resolveStream } from './StreamResolver';
import {
  createMusicResource,
  createSoundboardResource,
} from './ResourceFactory';

import { PlaybackController } from './PlaybackController';
import {
  sendNowPlaying,
  trackTrackStart,
  trackPlaybackStateChange,
} from './PlaybackSideEffects';
import { getPlaybackPosition } from './PlaybackTiming';

import { prebufferNext, clearPrebuffer } from './playback/PrebufferManager';

import { Track, TrackKind } from '@rainbot/protocol';
import type { VoiceState } from '@rainbot/protocol';

const log = createLogger('PLAYBACK');

/**
 * Play next track in queue
 */
export async function playNext(guildId: string): Promise<Track | null> {
  const state = getVoiceState(guildId);

  if (!state || state.queue.length === 0) {
    if (state) {
      state.nowPlaying = null;
      state.currentTrack = null;
      state.currentResource = null;
      state.preBuffered = null;
    }
    return null;
  }

  const track = state.queue.shift()!;
  log.info(`Starting playback: ${track.title}`);

  try {
    let resource: AudioResource;

    switch (track.kind) {
      case TrackKind.Local: {
        const storage = await import('../storage');
        if (!track.source) {
          throw new Error('Local track missing source');
        }

        const stream =
          track.source instanceof Readable
            ? track.source
            : await storage.getSoundStream(track.source);

        resource = createMusicResource(stream);
        break;
      }

      case TrackKind.Soundboard: {
        const storage = await import('../storage');
        if (!track.source) {
          throw new Error('Soundboard track missing source');
        }

        const stream = await storage.getSoundStream(track.source);
        resource = createSoundboardResource(stream);
        break;
      }

      case TrackKind.Music: {
        const stream = await resolveStream(track);
        resource = createMusicResource(stream);
        break;
      }

      default:
        throw new Error('Unknown track kind');
    }

    PlaybackController.play(state, track, resource);

    if (track.kind === TrackKind.Music) {
      sendNowPlaying(guildId, state, track);
      trackTrackStart(guildId, state, track);
    }

    return track;
  } catch (err) {
    const error = err as Error;
    log.error(`Failed to play ${track.title}: ${error.message}`);

    if (state.queue.length > 0) {
      log.warn('Skipping track, advancing queue');
      return playNext(guildId);
    }

    state.nowPlaying = null;
    state.currentTrack = null;
    return null;
  }
}

/**
 * Toggle pause / resume
 */
export function togglePause(
  guildId: string,
  userId: string | null = null,
  username: string | null = null
): { paused: boolean } {
  const state = getVoiceState(guildId);
  if (!state || !PlaybackController.canToggle(state)) {
    throw new Error('Nothing is playing');
  }

  if (state.player.state.status === AudioPlayerStatus.Paused) {
    PlaybackController.resume(state);

    trackPlaybackStateChange(
      guildId,
      state,
      'resume',
      'paused',
      'playing',
      userId,
      username
    );

    return { paused: false };
  }

  PlaybackController.pause(state);

  trackPlaybackStateChange(
    guildId,
    state,
    'pause',
    'playing',
    'paused',
    userId,
    username
  );

  return { paused: true };
}

/**
 * Stop playback and clear queue
 */
export function stopSound(guildId: string): boolean {
  const state = getVoiceState(guildId);
  if (!state) return false;

  PlaybackController.stop(state);
  log.info(`Stopped playback in guild ${guildId}`);
  return true;
}

/**
 * Set volume (music only)
 */
export function setVolume(
  guildId: string,
  level: number,
  userId: string | null = null,
  username: string | null = null
): number {
  const state = getVoiceState(guildId);
  if (!state) {
    throw new Error('Bot is not connected to a voice channel');
  }

  if (state.currentTrack?.kind !== TrackKind.Music) {
    return state.volume;
  }

  const oldVolume = state.volume;
  const volume = Math.max(1, Math.min(100, level));

  PlaybackController.setVolume(state, volume);

  trackPlaybackStateChange(
    guildId,
    state,
    'volume',
    String(oldVolume),
    String(volume),
    userId,
    username
  );

  return volume;
}

/**
 * Replay last played music track
 */
export async function replay(guildId: string): Promise<Track | null> {
  const state = getVoiceState(guildId);
  if (!state || !state.lastPlayedTrack) {
    throw new Error('No track to replay');
  }

  const track = { ...state.lastPlayedTrack };
  state.queue.unshift(track);
  state.player.stop();

  log.info(`Replaying: ${track.title}`);
  return track;
}

/**
 * Resume playback with seek (crash recovery)
 */
export async function playWithSeek(
  state: VoiceState,
  track: Track,
  seekSeconds: number,
  isPaused: boolean
): Promise<void> {
  log.info(`Resuming ${track.title} at ${seekSeconds}s`);

  if (track.kind !== TrackKind.Music) {
    throw new Error('Seek only supported for music tracks');
  }

  const stream = await resolveStream(track, seekSeconds);
  const resource = createMusicResource(stream);

  PlaybackController.play(state, track, resource);

  state.playbackStartTime = Date.now() - seekSeconds * 1000;

  if (isPaused) {
    state.player.pause();
    state.pauseStartTime = Date.now();
  }
}
