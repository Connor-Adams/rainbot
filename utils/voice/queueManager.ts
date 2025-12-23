/**
 * Queue Manager - Handles queue operations with mutex locking
 */
import { Mutex } from 'async-mutex';
import { AudioPlayerStatus } from '@discordjs/voice';
import { createLogger } from '../logger';
import { getVoiceState } from './connectionManager';
import type { Track, QueueInfo } from '../../types/voice';

const log = createLogger('QUEUE');

/** Map of guildId -> queue mutex */
const queueMutexes = new Map<string, Mutex>();

/**
 * Get or create a mutex for a guild's queue operations
 */
function getQueueMutex(guildId: string): Mutex {
  if (!queueMutexes.has(guildId)) {
    queueMutexes.set(guildId, new Mutex());
  }
  return queueMutexes.get(guildId)!;
}

/**
 * Execute a function with exclusive queue lock
 */
export async function withQueueLock<T>(guildId: string, fn: () => T | Promise<T>): Promise<T> {
  const mutex = getQueueMutex(guildId);
  const release = await mutex.acquire();
  try {
    return await fn();
  } finally {
    release();
  }
}

/**
 * Add tracks to queue
 */
export async function addToQueue(
  guildId: string,
  tracks: Track[]
): Promise<{ added: number; tracks: Track[] }> {
  return withQueueLock(guildId, () => {
    const state = getVoiceState(guildId);
    if (!state) {
      throw new Error('Bot is not connected to a voice channel');
    }

    state.queue.push(...tracks);
    log.info(`Added ${tracks.length} track(s) to queue`);

    return {
      added: tracks.length,
      tracks: tracks,
    };
  });
}

/**
 * Skip current track(s)
 */
export async function skip(guildId: string, count: number = 1): Promise<string[]> {
  return withQueueLock(guildId, () => {
    const state = getVoiceState(guildId);
    if (!state) {
      throw new Error('Bot is not connected to a voice channel');
    }

    if (!state.nowPlaying && state.queue.length === 0) {
      throw new Error('Nothing is playing');
    }

    const skipped: string[] = [];
    if (state.nowPlaying) {
      skipped.push(state.nowPlaying);
    }

    const tracksToRemove = Math.min(count - 1, state.queue.length);
    for (let i = 0; i < tracksToRemove; i++) {
      if (state.queue.length > 0) {
        const track = state.queue[0];
        if (track) {
          skipped.push(track.title);
        }
        state.queue.shift();
      }
    }

    state.player.stop();
    return skipped;
  });
}

/**
 * Clear the queue
 */
export async function clearQueue(guildId: string): Promise<number> {
  return withQueueLock(guildId, () => {
    const state = getVoiceState(guildId);
    if (!state) {
      throw new Error('Bot is not connected to a voice channel');
    }

    const cleared = state.queue.length;
    state.queue = [];
    log.info(`Cleared ${cleared} tracks from queue`);
    return cleared;
  });
}

/**
 * Remove a track from the queue by index
 */
export async function removeTrackFromQueue(guildId: string, index: number): Promise<Track> {
  return withQueueLock(guildId, () => {
    const state = getVoiceState(guildId);
    if (!state) {
      throw new Error('Bot is not connected to a voice channel');
    }

    if (index < 0 || index >= state.queue.length) {
      throw new Error('Invalid queue index');
    }

    const [removed] = state.queue.splice(index, 1);
    if (!removed) {
      throw new Error('Track not found at index');
    }
    log.info(`Removed track "${removed.title}" from queue at index ${index}`);
    return removed;
  });
}

/**
 * Get the current queue with stateful information
 */
export function getQueue(guildId: string): QueueInfo {
  const state = getVoiceState(guildId);
  if (!state) {
    return {
      nowPlaying: null,
      queue: [],
      totalInQueue: 0,
      currentTrack: null,
      playbackPosition: 0,
      hasOverlay: false,
      isPaused: false,
      channelName: null,
    };
  }

  let playbackPosition = 0;
  if (state.playbackStartTime && state.currentTrack) {
    const elapsed = Date.now() - state.playbackStartTime;
    const pausedTime = state.totalPausedTime || 0;
    const currentPauseTime = state.pauseStartTime ? Date.now() - state.pauseStartTime : 0;
    playbackPosition = Math.max(0, Math.floor((elapsed - pausedTime - currentPauseTime) / 1000));

    if (state.currentTrack.duration && playbackPosition > state.currentTrack.duration) {
      playbackPosition = state.currentTrack.duration;
    }
  }

  return {
    nowPlaying: state.nowPlaying,
    queue: state.queue.slice(0, 20),
    totalInQueue: state.queue.length,
    currentTrack: state.currentTrack || null,
    playbackPosition: playbackPosition,
    hasOverlay: !!state.overlayProcess,
    isPaused: state.player.state.status === AudioPlayerStatus.Paused,
    channelName: state.channelName,
  };
}

/**
 * Restore queue from history
 */
export async function restoreQueue(guildId: string, tracks: Track[]): Promise<void> {
  const state = getVoiceState(guildId);
  if (!state) {
    throw new Error('Bot is not connected to a voice channel');
  }
  state.queue = [...tracks];
  log.info(`Restored ${tracks.length} tracks to queue`);
}
