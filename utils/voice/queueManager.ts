/**
 * Queue Manager - Handles queue operations with mutex locking
 */
import { Mutex } from 'async-mutex';
import { AudioPlayerStatus } from '@discordjs/voice';
import { createLogger } from '../logger';
import * as stats from '../statistics';
import { getVoiceState } from './connectionManager';
import type { QueueState, MediaItem } from '@rainbot/types/media';
import type { Track } from '@rainbot/types/voice';

const log = createLogger('QUEUE');

/** Map of guildId -> queue mutex */
const queueMutexes = new Map<string, Mutex>();

/** Map of guildId -> debounce timer for snapshot saves */
const saveDebounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

/** Debounce delay for snapshot saves (5 seconds) */
const SAVE_DEBOUNCE_MS = 5000;

/**
 * Schedule a debounced queue snapshot save
 */
function scheduleSave(guildId: string): void {
  if (process.env['NODE_ENV'] === 'test') {
    return;
  }

  // Clear existing timer
  const existing = saveDebounceTimers.get(guildId);
  if (existing) {
    clearTimeout(existing);
  }

  // Schedule new save
  const timer = setTimeout(async () => {
    saveDebounceTimers.delete(guildId);
    try {
      const { saveQueueSnapshot } = await import('./snapshotPersistence');
      await saveQueueSnapshot(guildId);
    } catch (error) {
      log.debug(`Debounced save failed for ${guildId}: ${(error as Error).message}`);
    }
  }, SAVE_DEBOUNCE_MS);
  timer.unref?.();

  saveDebounceTimers.set(guildId, timer);
}

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

    // Schedule snapshot save
    scheduleSave(guildId);

    return {
      added: tracks.length,
      tracks: tracks,
    };
  });
}

/**
 * Skip current track(s)
 */
export async function skip(
  guildId: string,
  count: number = 1,
  skippedBy: string | null = null
): Promise<string[]> {
  return withQueueLock(guildId, () => {
    const state = getVoiceState(guildId);
    if (!state) {
      throw new Error('Bot is not connected to a voice channel');
    }

    if (!state.nowPlaying && state.queue.length === 0) {
      throw new Error('Nothing is playing');
    }

    // Set flag to prevent double-tracking in Idle handler
    state.wasManuallySkipped = true;

    // End track engagement - track was skipped
    stats.endTrackEngagement(guildId, true, 'user_skip', skippedBy, null);

    const skipped: string[] = [];
    if (state.nowPlaying) {
      skipped.push(state.nowPlaying);
    }

    const tracksToRemove = Math.min(count - 1, state.queue.length);
    for (let i = 0; i < tracksToRemove; i++) {
      if (state.queue.length > 0) {
        const track = state.queue[0];
        if (track) {
          skipped.push(track.title ?? 'Unknown');
        }
        state.queue.shift();
      }
    }

    state.player.stop();

    // Schedule snapshot save
    scheduleSave(guildId);

    return skipped;
  });
}

/**
 * Clear the queue
 */
export async function clearQueue(
  guildId: string,
  clearedBy: string | null = null
): Promise<number> {
  return withQueueLock(guildId, () => {
    const state = getVoiceState(guildId);
    if (!state) {
      throw new Error('Bot is not connected to a voice channel');
    }

    // End track engagement if something is playing - queue was cleared
    if (state.nowPlaying) {
      state.wasManuallySkipped = true;
      stats.endTrackEngagement(guildId, true, 'queue_clear', clearedBy, null);
    }

    const cleared = state.queue.length;
    state.queue = [];
    log.info(`Cleared ${cleared} tracks from queue`);

    // Schedule snapshot save (will delete the snapshot since queue is empty)
    scheduleSave(guildId);

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

    // Schedule snapshot save
    scheduleSave(guildId);

    return removed;
  });
}

/**
 * Get the current queue with stateful information
 */
export function getQueue(guildId: string): QueueState {
  const state = getVoiceState(guildId);
  if (!state) {
    return {
      queue: [],
    };
  }

  const nowPlaying: MediaItem | undefined =
    state.currentTrack || (state.nowPlaying ? { title: state.nowPlaying } : undefined);

  return {
    nowPlaying,
    queue: state.queue.slice(0, 20),
    isPaused: state.player.state.status === AudioPlayerStatus.Paused,
    isAutoplay: state.autoplay || false,
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
