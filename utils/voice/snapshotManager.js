const { createLogger } = require('../logger');
const { query } = require('../database');

const log = createLogger('SNAPSHOT_MANAGER');

/**
 * Save queue snapshot to database for persistence across restarts
 * @param {string} guildId - Guild ID
 * @param {Object} state - Voice state
 */
async function saveQueueSnapshot(guildId, state) {
    if (!state || (!state.currentTrack && state.queue.length === 0)) return;

    // Calculate current position in ms
    let positionMs = 0;
    if (state.playbackStartTime && state.currentTrack) {
        const elapsed = Date.now() - state.playbackStartTime;
        const pausedTime = state.totalPausedTime || 0;
        const currentPause = state.pauseStartTime ? (Date.now() - state.pauseStartTime) : 0;
        positionMs = Math.max(0, elapsed - pausedTime - currentPause);
    }

    try {
        await query(`
            INSERT INTO guild_queue_snapshots
            (guild_id, channel_id, queue_data, current_track, position_ms, is_paused, volume, last_user_id, saved_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
            ON CONFLICT (guild_id) DO UPDATE SET
                channel_id = EXCLUDED.channel_id,
                queue_data = EXCLUDED.queue_data,
                current_track = EXCLUDED.current_track,
                position_ms = EXCLUDED.position_ms,
                is_paused = EXCLUDED.is_paused,
                volume = EXCLUDED.volume,
                last_user_id = EXCLUDED.last_user_id,
                saved_at = EXCLUDED.saved_at
        `, [
            guildId,
            state.channelId,
            JSON.stringify(state.queue),
            state.currentTrack ? JSON.stringify(state.currentTrack) : null,
            positionMs,
            !!state.pauseStartTime,
            state.volume || 100,
            state.lastUserId
        ]);
        log.info(`Saved queue snapshot for guild ${guildId} (${state.queue.length} tracks, position: ${Math.floor(positionMs / 1000)}s)`);
    } catch (error) {
        log.error(`Failed to save queue snapshot for ${guildId}: ${error.message}`);
    }
}

/**
 * Save all active queue snapshots (for graceful shutdown)
 * @param {Map} voiceStates - Map of guild ID to voice state
 */
async function saveAllQueueSnapshots(voiceStates) {
    const promises = [];
    for (const [guildId, state] of voiceStates) {
        promises.push(saveQueueSnapshot(guildId, state).catch(e =>
            log.error(`Failed to save snapshot for ${guildId}: ${e.message}`)
        ));
    }
    await Promise.all(promises);
    log.info(`Saved ${promises.length} queue snapshot(s)`);
}

/**
 * Restore queue snapshot from database
 * @param {string} guildId - Guild ID
 * @param {Object} client - Discord client
 * @param {Function} joinChannel - Function to join voice channel
 * @param {Function} playWithSeek - Function to play with seek position
 * @param {Function} playNext - Function to play next track
 * @returns {Promise<boolean>} Whether restore was successful
 */
async function restoreQueueSnapshot(guildId, client, joinChannel, playWithSeek, playNext) {
    try {
        const result = await query(
            'SELECT * FROM guild_queue_snapshots WHERE guild_id = $1',
            [guildId]
        );
        if (!result?.rows?.[0]) return false;

        const snapshot = result.rows[0];
        const guild = client.guilds.cache.get(guildId);
        if (!guild) {
            log.warn(`Guild ${guildId} not found, deleting snapshot`);
            await query('DELETE FROM guild_queue_snapshots WHERE guild_id = $1', [guildId]);
            return false;
        }

        const channel = guild.channels.cache.get(snapshot.channel_id);
        if (!channel?.isVoiceBased()) {
            log.warn(`Voice channel ${snapshot.channel_id} not found or invalid, deleting snapshot`);
            await query('DELETE FROM guild_queue_snapshots WHERE guild_id = $1', [guildId]);
            return false;
        }

        // Join channel
        await joinChannel(channel);
        
        // Get the voice state that was just created
        const state = require('../voiceManager').getVoiceState(guildId);
        if (!state) {
            log.error(`Failed to join channel for restore in guild ${guildId}`);
            return false;
        }

        // Restore state
        state.queue = snapshot.queue_data || [];
        state.volume = snapshot.volume || 100;
        state.lastUserId = snapshot.last_user_id;

        // Resume playback with seek
        if (snapshot.current_track) {
            const track = snapshot.current_track;
            const seekSeconds = Math.floor((snapshot.position_ms || 0) / 1000);
            await playWithSeek(state, track, seekSeconds, snapshot.is_paused);
        } else if (state.queue.length > 0) {
            await playNext(guildId);
        }

        // Delete snapshot after successful restore
        await query('DELETE FROM guild_queue_snapshots WHERE guild_id = $1', [guildId]);
        log.info(`Restored queue snapshot for guild ${guildId}: ${state.queue.length} tracks in queue`);
        return true;
    } catch (error) {
        log.error(`Failed to restore queue snapshot for ${guildId}: ${error.message}`);
        return false;
    }
}

/**
 * Restore all queue snapshots (called on bot startup)
 * @param {Object} client - Discord client
 * @param {Function} joinChannel - Function to join voice channel
 * @param {Function} playWithSeek - Function to play with seek position
 * @param {Function} playNext - Function to play next track
 * @returns {Promise<number>} Number of successfully restored snapshots
 */
async function restoreAllQueueSnapshots(client, joinChannel, playWithSeek, playNext) {
    try {
        const result = await query('SELECT guild_id FROM guild_queue_snapshots');
        if (!result?.rows?.length) return 0;

        let restored = 0;
        for (const row of result.rows) {
            try {
                if (await restoreQueueSnapshot(row.guild_id, client, joinChannel, playWithSeek, playNext)) {
                    restored++;
                }
            } catch (error) {
                log.error(`Failed to restore ${row.guild_id}: ${error.message}`);
            }
        }
        return restored;
    } catch (error) {
        log.error(`Failed to query queue snapshots: ${error.message}`);
        return 0;
    }
}

module.exports = {
    saveQueueSnapshot,
    saveAllQueueSnapshots,
    restoreQueueSnapshot,
    restoreAllQueueSnapshots,
};
