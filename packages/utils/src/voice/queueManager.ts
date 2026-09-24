/**
 * Queue Manager - Handles queue operations with mutex locking
 */
import { Mutex } from 'async-mutex';
import { AudioPlayerStatus } from '@discordjs/voice';
import { trace, type Attributes } from '@opentelemetry/api';
import { withSpan, RainbotAttr } from '@rainbot/observability/node';
import { createLogger } from '../logger';
import * as stats from '../statistics';
import { getVoiceState } from './connectionManager';
import type { QueueState, MediaItem } from '@rainbot/protocol';
import type { Track } from '@rainbot/protocol';

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
 * Execute a function with exclusive queue lock.
 *
 * `operation` is an optional caller-supplied label (e.g. 'addToQueue') recorded
 * on the span so `queue.mutate` traces can be broken down by what kind of
 * mutation ran, not just which guild. It's optional because withQueueLock is
 * called from a handful of sites; callers that can name their operation
 * cheaply should, but none are forced to.
 */
export async function withQueueLock<T>(
  guildId: string,
  fn: () => T | Promise<T>,
  operation?: string
): Promise<T> {
  const attributes: Attributes = { [RainbotAttr.guildId]: guildId };
  if (operation) {
    attributes[RainbotAttr.queueOperation] = operation;
  }

  return withSpan('queue.mutate', attributes, async () => {
    const mutex = getQueueMutex(guildId);

    // Lock acquisition gets its own child span so lock wait time is visible
    // on its own, separate from however long fn() takes to run. Queue race
    // conditions are a recurring bug source here, so being able to tell "the
    // lock was slow to acquire" apart from "the mutation itself was slow" is
    // the whole point of this span — an undifferentiated queue.mutate
    // duration couldn't answer that. This does not change acquisition order,
    // release timing, or error propagation: it's the same
    // `await mutex.acquire()` call, just measured.
    const release = await withSpan('queue.lock_wait', { [RainbotAttr.guildId]: guildId }, () =>
      mutex.acquire()
    );

    const span = trace.getActiveSpan();
    span?.setAttribute(RainbotAttr.queueLength, getVoiceState(guildId)?.queue.length ?? 0);

    try {
      const result = await fn();
      span?.setAttribute(RainbotAttr.queueLengthAfter, getVoiceState(guildId)?.queue.length ?? 0);
      return result;
    } finally {
      release();
    }
  });
}

/**
 * Add tracks to queue
 */
export async function addToQueue(
  guildId: string,
  tracks: Track[]
): Promise<{ added: number; tracks: Track[] }> {
  return withQueueLock(
    guildId,
    () => {
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
    },
    'addToQueue'
  );
}

/**
 * Skip current track(s)
 */
export async function skip(
  guildId: string,
  count: number = 1,
  skippedBy: string | null = null
): Promise<string[]> {
  return withQueueLock(
    guildId,
    () => {
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
    },
    'skip'
  );
}

/**
 * Clear the queue
 */
export async function clearQueue(
  guildId: string,
  clearedBy: string | null = null
): Promise<number> {
  return withQueueLock(
    guildId,
    () => {
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
    },
    'clearQueue'
  );
}

/**
 * Remove a track from the queue by index
 */
export async function removeTrackFromQueue(guildId: string, index: number): Promise<Track> {
  return withQueueLock(
    guildId,
    () => {
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
    },
    'removeTrackFromQueue'
  );
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
