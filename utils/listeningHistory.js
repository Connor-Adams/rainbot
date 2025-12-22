const { createLogger } = require('./logger');

const log = createLogger('HISTORY');

// Map of userId -> { guildId, queue, nowPlaying, timestamp }
const userHistory = new Map();

// Maximum number of tracks to store in history
const MAX_HISTORY_TRACKS = 50;

/**
 * Save listening history for a user
 * @param {string} userId - User ID
 * @param {string} guildId - Guild ID
 * @param {Array} queue - Queue of tracks
 * @param {string} nowPlaying - Currently playing track title
 * @param {Object} currentTrack - Current track object
 */
function saveHistory(userId, guildId, queue, nowPlaying, currentTrack) {
    if (!userId || !guildId) return;

    // Only save if there's actual content
    if (!nowPlaying && (!queue || queue.length === 0)) {
        return;
    }

    userHistory.set(userId, {
        guildId,
        queue: queue ? queue.slice(0, MAX_HISTORY_TRACKS) : [],
        nowPlaying,
        currentTrack,
        timestamp: Date.now(),
    });

    log.debug(`Saved history for user ${userId} in guild ${guildId}`);
}

/**
 * Get listening history for a user
 * @param {string} userId - User ID
 * @returns {Object|null} History object or null if not found
 */
function getHistory(userId) {
    if (!userId) return null;

    const history = userHistory.get(userId);
    if (!history) return null;

    // Check if history is too old (older than 24 hours)
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours
    if (Date.now() - history.timestamp > maxAge) {
        userHistory.delete(userId);
        log.debug(`Deleted expired history for user ${userId}`);
        return null;
    }

    return history;
}

/**
 * Clear history for a user
 * @param {string} userId - User ID
 */
function clearHistory(userId) {
    if (!userId) return;
    userHistory.delete(userId);
    log.debug(`Cleared history for user ${userId}`);
}

/**
 * Track a track being played (adds to history)
 * @param {string} userId - User ID
 * @param {string} guildId - Guild ID
 * @param {Object} track - Track object
 */
function trackPlayed(userId, guildId, track) {
    if (!userId || !guildId || !track) return;

    const history = getHistory(userId) || {
        guildId,
        queue: [],
        nowPlaying: null,
        currentTrack: null,
        timestamp: Date.now(),
    };

    // Update history
    history.guildId = guildId;
    history.nowPlaying = track.title;
    history.currentTrack = track;
    history.timestamp = Date.now();

    userHistory.set(userId, history);
}

module.exports = {
    saveHistory,
    getHistory,
    clearHistory,
    trackPlayed,
};

