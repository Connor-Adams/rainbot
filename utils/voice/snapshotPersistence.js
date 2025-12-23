/**
 * Snapshot Persistence - Handles queue snapshot save/restore
 */
const { createLogger } = require('../logger');
const { getVoiceState } = require('./connectionManager');
const { query } = require('../database');

const log = createLogger('SNAPSHOT');

/**
 * Save queue snapshot to database for persistence across restarts
 * @param {string} guildId - Guild ID
 * @returns {Promise<void>}
 */
async function saveQueueSnapshot(guildId) {
  const state = getVoiceState(guildId);
  if (!state || (!state.currentTrack && state.queue.length === 0)) {
    log.debug(`No queue to save for guild ${guildId}`);
    return;
  }

  // Calculate current playback position
  let positionMs = 0;
  if (state.playbackStartTime && state.currentTrack) {
    const elapsed = Date.now() - state.playbackStartTime;
    const pausedTime = state.totalPausedTime || 0;
    const currentPause = state.pauseStartTime ? Date.now() - state.pauseStartTime : 0;
    positionMs = Math.max(0, elapsed - pausedTime - currentPause);
  }

  try {
    await query(
      `
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
      `,
      [
        guildId,
        state.channelId,
        JSON.stringify(state.queue),
        state.currentTrack ? JSON.stringify(state.currentTrack) : null,
        positionMs,
        !!state.pauseStartTime,
        state.volume || 100,
        state.lastUserId,
      ]
    );
    log.info(
      `Saved queue snapshot for guild ${guildId} (${state.queue.length} tracks, position: ${Math.floor(positionMs / 1000)}s)`
    );
  } catch (error) {
    log.error(`Failed to save queue snapshot for ${guildId}: ${error.message}`);
  }
}

/**
 * Save all active queue snapshots (for graceful shutdown)
 * @returns {Promise<void>}
 */
async function saveAllQueueSnapshots() {
  const { voiceStates } = require('./connectionManager');
  const promises = [];
  for (const guildId of voiceStates.keys()) {
    promises.push(
      saveQueueSnapshot(guildId).catch((e) =>
        log.error(`Failed to save snapshot for ${guildId}: ${e.message}`)
      )
    );
  }
  await Promise.all(promises);
  log.info(`Saved ${promises.length} queue snapshot(s)`);
}

/**
 * Restore queue snapshot from database
 * @param {string} guildId - Guild ID
 * @param {Object} client - Discord client
 * @returns {Promise<boolean>} - Whether restore was successful
 */
async function restoreQueueSnapshot(guildId, client) {
  try {
    const result = await query('SELECT * FROM guild_queue_snapshots WHERE guild_id = $1', [
      guildId,
    ]);
    if (!result?.rows?.[0]) {
      log.debug(`No snapshot found for guild ${guildId}`);
      return false;
    }

    log.info(`Found snapshot for guild ${guildId} - restoration not fully implemented yet`);
    // TODO: Implement full restoration with channel joining and playback resume
    
    return false;
  } catch (error) {
    log.error(`Failed to restore queue snapshot for ${guildId}: ${error.message}`);
    return false;
  }
}

/**
 * Restore all queue snapshots (called on bot startup)
 * @param {Object} client - Discord client
 * @returns {Promise<number>} - Number of successfully restored snapshots
 */
async function restoreAllQueueSnapshots(client) {
  try {
    const result = await query('SELECT guild_id FROM guild_queue_snapshots');
    if (!result?.rows?.length) {
      log.info('No queue snapshots to restore');
      return 0;
    }

    log.info(`Found ${result.rows.length} queue snapshot(s) - restoration not fully implemented yet`);
    // TODO: Implement full restoration
    
    return 0;
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
