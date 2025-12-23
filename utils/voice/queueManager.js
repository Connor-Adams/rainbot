const { Mutex } = require('async-mutex');
const { createLogger } = require('../logger');

const log = createLogger('QUEUE_MANAGER');

/**
 * @type {Map<string, Mutex>}
 * Map of guildId -> queue mutex for thread-safe queue operations
 */
const queueMutexes = new Map();

/**
 * Get or create a mutex for a guild's queue operations
 * @param {string} guildId - Guild ID
 * @returns {Mutex} Mutex for the guild
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
 * @param {Function} fn - Function to execute with lock
 * @returns {Promise<any>} Result of the function
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
 * @param {Object} state - Voice state
 * @param {Array} tracks - Tracks to add
 */
function addToQueue(state, tracks) {
  state.queue.push(...tracks);
}

/**
 * Clear all tracks from queue
 * @param {Object} state - Voice state
 * @returns {number} Number of cleared tracks
 */
function clearQueue(state) {
  const cleared = state.queue.length;
  state.queue = [];
  return cleared;
}

/**
 * Remove track at specific index
 * @param {Object} state - Voice state
 * @param {number} index - Index to remove
 * @returns {Object} Removed track
 */
function removeTrack(state, index) {
  if (index < 0 || index >= state.queue.length) {
    throw new Error('Invalid queue index');
  }
  return state.queue.splice(index, 1)[0];
}

/**
 * Get next track from queue
 * @param {Object} state - Voice state
 * @returns {Object|null} Next track or null
 */
function getNextTrack(state) {
  return state.queue.shift() || null;
}

/**
 * Skip multiple tracks
 * @param {Object} state - Voice state
 * @param {number} count - Number to skip (excluding current)
 * @returns {Array<string>} Skipped track titles
 */
function skipTracks(state, count) {
  const skipped = [];

  // Current track
  if (state.nowPlaying) {
    skipped.push(state.nowPlaying);
  }

  // Queue tracks
  const tracksToRemove = Math.min(count - 1, state.queue.length);
  for (let i = 0; i < tracksToRemove; i++) {
    if (state.queue.length > 0) {
      skipped.push(state.queue[0].title);
      state.queue.shift();
    }
  }

  return skipped;
}

/**
 * Get queue snapshot
 * @param {Object} state - Voice state
 * @param {number} limit - Maximum tracks to return
 * @returns {Object} Queue info
 */
function getQueueSnapshot(state, limit = 20) {
  return {
    queue: state.queue.slice(0, limit),
    totalInQueue: state.queue.length,
    nowPlaying: state.nowPlaying,
    currentTrack: state.currentTrack || null,
  };
}

module.exports = {
  getQueueMutex,
  withQueueLock,
  addToQueue,
  clearQueue,
  removeTrack,
  getNextTrack,
  skipTracks,
  getQueueSnapshot,
};
