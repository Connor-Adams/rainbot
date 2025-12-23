/**
 * Queue Manager - Handles queue operations with mutex locking
 */
const { Mutex } = require('async-mutex');
const { AudioPlayerStatus } = require('@discordjs/voice');
const { createLogger } = require('../logger');
const { getVoiceState } = require('./connectionManager');

const log = createLogger('QUEUE');

/** @type {Map<string, Mutex>} Map of guildId -> queue mutex */
const queueMutexes = new Map();

/**
 * Get or create a mutex for a guild's queue operations
 * @param {string} guildId - Guild ID
 * @returns {Mutex}
 */
function getQueueMutex(guildId) {
  if (!queueMutexes.has(guildId)) {
    queueMutexes.set(guildId, new Mutex());
  }
  return queueMutexes.get(guildId);
}

/**
 * Execute a function with exclusive queue lock
 * @param {string} guildId - Guild ID
 * @param {Function} fn - Function to execute
 * @returns {Promise<any>}
 */
async function withQueueLock(guildId, fn) {
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
 * @param {string} guildId - Guild ID
 * @param {Array<Track>} tracks - Tracks to add
 * @returns {Promise<{added: number, tracks: Array<Track>}>}
 */
async function addToQueue(guildId, tracks) {
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
 * @param {string} guildId - Guild ID
 * @param {number} count - Number of tracks to skip
 * @returns {Promise<Array<string>>} - Array of skipped track titles
 */
async function skip(guildId, count = 1) {
  return withQueueLock(guildId, () => {
    const state = getVoiceState(guildId);
    if (!state) {
      throw new Error('Bot is not connected to a voice channel');
    }

    if (!state.nowPlaying && state.queue.length === 0) {
      throw new Error('Nothing is playing');
    }

    const skipped = [];
    if (state.nowPlaying) {
      skipped.push(state.nowPlaying);
    }

    const tracksToRemove = Math.min(count - 1, state.queue.length);
    for (let i = 0; i < tracksToRemove; i++) {
      if (state.queue.length > 0) {
        skipped.push(state.queue[0].title);
        state.queue.shift();
      }
    }

    state.player.stop();
    return skipped;
  });
}

/**
 * Clear the queue
 * @param {string} guildId - Guild ID
 * @returns {Promise<number>} - Number of tracks cleared
 */
async function clearQueue(guildId) {
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
 * @param {string} guildId - Guild ID
 * @param {number} index - Queue index
 * @returns {Promise<Track>} - Removed track
 */
async function removeTrackFromQueue(guildId, index) {
  return withQueueLock(guildId, () => {
    const state = getVoiceState(guildId);
    if (!state) {
      throw new Error('Bot is not connected to a voice channel');
    }

    if (index < 0 || index >= state.queue.length) {
      throw new Error('Invalid queue index');
    }

    const removed = state.queue.splice(index, 1)[0];
    log.info(`Removed track "${removed.title}" from queue at index ${index}`);
    return removed;
  });
}

/**
 * Get the current queue with stateful information
 * @param {string} guildId - Guild ID
 * @returns {Object} - Queue info object
 */
function getQueue(guildId) {
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
 * @param {string} guildId - Guild ID
 * @param {Array<Track>} tracks - Tracks to restore
 * @returns {Promise<void>}
 */
async function restoreQueue(guildId, tracks) {
  const state = getVoiceState(guildId);
  if (!state) {
    throw new Error('Bot is not connected to a voice channel');
  }
  state.queue = [...tracks];
  log.info(`Restored ${tracks.length} tracks to queue`);
}

module.exports = {
  addToQueue,
  skip,
  clearQueue,
  removeTrackFromQueue,
  getQueue,
  restoreQueue,
  withQueueLock,
};
