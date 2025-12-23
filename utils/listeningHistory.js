const { createLogger } = require('./logger');
const { query } = require('./database');

const log = createLogger('HISTORY');

// Map of userId -> { guildId, queue, nowPlaying, timestamp } (for in-memory quick access)
const userHistory = new Map();

// Maximum number of tracks to store in in-memory history
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
 * Clear history for a user (in-memory only, use clearListeningHistory for database)
 * @param {string} userId - User ID
 */
function clearHistory(userId) {
    if (!userId) return;
    userHistory.delete(userId);
    log.debug(`Cleared in-memory history for user ${userId}`);
}

/**
 * Track a track being played (adds to persistent database history)
 * @param {string} userId - User ID
 * @param {string} guildId - Guild ID
 * @param {Object} track - Track object
 * @param {string} queuedBy - User ID who queued the track (optional)
 */
async function trackPlayed(userId, guildId, track, queuedBy = null) {
    if (!userId || !guildId || !track) return;

    try {
        // Determine source type
        let sourceType = 'other';
        if (track.isLocal) {
            sourceType = 'local';
        } else if (track.url) {
            if (track.url.includes('youtube.com') || track.url.includes('youtu.be')) {
                sourceType = 'youtube';
            } else if (track.url.includes('spotify.com') || track.spotifyId) {
                sourceType = 'spotify';
            } else if (track.url.includes('soundcloud.com')) {
                sourceType = 'soundcloud';
            }
        }

        // Store in database
        await query(
            `INSERT INTO listening_history 
            (user_id, guild_id, track_title, track_url, source_type, is_soundboard, duration, played_at, source, queued_by, metadata)
            VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), $8, $9, $10)`,
            [
                userId,
                guildId,
                track.title || 'Unknown',
                track.url || null,
                sourceType,
                track.isSoundboard || false,
                track.duration || null,
                track.source || 'discord',
                queuedBy || null,
                track.spotifyId || track.spotifyUrl ? JSON.stringify({ spotifyId: track.spotifyId, spotifyUrl: track.spotifyUrl }) : null,
            ]
        );

        // Also update in-memory history for quick access
        const history = getHistory(userId) || {
            guildId,
            queue: [],
            nowPlaying: null,
            currentTrack: null,
            timestamp: Date.now(),
        };

        history.guildId = guildId;
        history.nowPlaying = track.title;
        history.currentTrack = track;
        history.timestamp = Date.now();

        userHistory.set(userId, history);
    } catch (error) {
        log.error(`Failed to track played track: ${error.message}`);
    }
}

/**
 * Get listening history from database
 * @param {string} userId - User ID
 * @param {string} guildId - Optional guild ID to filter by
 * @param {number} limit - Maximum number of tracks to return (default: 100)
 * @param {Date} startDate - Optional start date filter
 * @param {Date} endDate - Optional end date filter
 * @returns {Promise<Array>} Array of history entries
 */
async function getListeningHistory(userId, guildId = null, limit = 100, startDate = null, endDate = null) {
    if (!userId) return [];

    try {
        const params = [userId];
        let whereClause = 'WHERE user_id = $1';
        let paramIndex = 2;

        if (guildId) {
            whereClause += ` AND guild_id = $${paramIndex++}`;
            params.push(guildId);
        }

        if (startDate) {
            whereClause += ` AND played_at >= $${paramIndex++}`;
            params.push(startDate);
        }

        if (endDate) {
            whereClause += ` AND played_at <= $${paramIndex++}`;
            params.push(endDate);
        }

        params.push(limit);

        const result = await query(
            `SELECT * FROM listening_history 
            ${whereClause}
            ORDER BY played_at DESC
            LIMIT $${paramIndex}`,
            params
        );

        return result?.rows || [];
    } catch (error) {
        log.error(`Failed to get listening history: ${error.message}`);
        return [];
    }
}

/**
 * Get recent listening history for a user (last session)
 * @param {string} userId - User ID
 * @param {string} guildId - Guild ID
 * @returns {Promise<Object|null>} History object with queue and nowPlaying
 */
async function getRecentHistory(userId, guildId) {
    if (!userId || !guildId) return null;

    try {
        // Get last 50 tracks from this guild
        const result = await query(
            `SELECT * FROM listening_history 
            WHERE user_id = $1 AND guild_id = $2
            ORDER BY played_at DESC
            LIMIT 50`,
            [userId, guildId]
        );

        if (!result || result.rows.length === 0) {
            return null;
        }

        const tracks = result.rows.reverse(); // Oldest first
        const lastTrack = tracks[tracks.length - 1];

        return {
            guildId,
            queue: tracks.slice(0, -1).map(row => ({
                title: row.track_title,
                url: row.track_url,
                duration: row.duration,
                isLocal: row.source_type === 'local',
                sourceType: row.source_type,
            })),
            nowPlaying: lastTrack.track_title,
            currentTrack: {
                title: lastTrack.track_title,
                url: lastTrack.track_url,
                duration: lastTrack.duration,
                isLocal: lastTrack.source_type === 'local',
            },
            timestamp: lastTrack.played_at.getTime(),
        };
    } catch (error) {
        log.error(`Failed to get recent history: ${error.message}`);
        return null;
    }
}

/**
 * Clear listening history for a user
 * @param {string} userId - User ID
 * @param {string} guildId - Optional guild ID to clear only that guild's history
 */
async function clearListeningHistory(userId, guildId = null) {
    if (!userId) return;

    try {
        if (guildId) {
            await query(
                'DELETE FROM listening_history WHERE user_id = $1 AND guild_id = $2',
                [userId, guildId]
            );
        } else {
            await query(
                'DELETE FROM listening_history WHERE user_id = $1',
                [userId]
            );
        }

        // Also clear in-memory history
        clearHistory(userId);
        log.debug(`Cleared listening history for user ${userId}${guildId ? ` in guild ${guildId}` : ''}`);
    } catch (error) {
        log.error(`Failed to clear listening history: ${error.message}`);
    }
}

module.exports = {
    saveHistory,
    getHistory,
    clearHistory,
    trackPlayed,
    getListeningHistory,
    getRecentHistory,
    clearListeningHistory,
};

