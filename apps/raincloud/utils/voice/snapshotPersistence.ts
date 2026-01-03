/**
 * Snapshot Persistence - Handles queue snapshot save/restore for crash recovery
 */
import type { Client, VoiceBasedChannel } from 'discord.js';
import { createLogger } from '../logger';
import { getVoiceState, voiceStates, joinChannel } from './connectionManager';
import { query } from '../database';
import type { Track } from '../../types/voice';

const log = createLogger('SNAPSHOT');

/** Auto-save interval in milliseconds (30 seconds) */
const AUTO_SAVE_INTERVAL_MS = 30_000;

/** Reference to auto-save interval timer */
let autoSaveInterval: ReturnType<typeof setInterval> | null = null;

interface QueueSnapshot {
  guild_id: string;
  channel_id: string;
  queue_data: string;
  current_track: string | null;
  position_ms: number;
  is_paused: boolean;
  volume: number;
  last_user_id: string | null;
  saved_at: Date;
}

/**
 * Start periodic auto-save of queue snapshots
 */
export function startAutoSave(): void {
  if (autoSaveInterval) {
    log.debug('Auto-save already running');
    return;
  }

  autoSaveInterval = setInterval(async () => {
    const activeGuilds = voiceStates.size;
    if (activeGuilds === 0) return;

    log.debug(`Auto-saving ${activeGuilds} queue snapshot(s)...`);
    await saveAllQueueSnapshots();
  }, AUTO_SAVE_INTERVAL_MS);

  log.info(`Started auto-save interval (every ${AUTO_SAVE_INTERVAL_MS / 1000}s)`);
}

/**
 * Stop periodic auto-save
 */
export function stopAutoSave(): void {
  if (autoSaveInterval) {
    clearInterval(autoSaveInterval);
    autoSaveInterval = null;
    log.info('Stopped auto-save interval');
  }
}

/**
 * Save queue snapshot to database for persistence across restarts
 */
export async function saveQueueSnapshot(guildId: string): Promise<void> {
  const state = getVoiceState(guildId);
  if (!state || (!state.currentTrack && state.queue.length === 0)) {
    // Delete any existing snapshot if queue is now empty
    try {
      await query('DELETE FROM guild_queue_snapshots WHERE guild_id = $1', [guildId]);
    } catch {
      // Ignore deletion errors
    }
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
    log.debug(
      `Saved snapshot: guild ${guildId}, ${state.queue.length} queued, position ${Math.floor(positionMs / 1000)}s`
    );
  } catch (error) {
    log.error(`Failed to save queue snapshot for ${guildId}: ${(error as Error).message}`);
  }
}

/**
 * Save all active queue snapshots (for graceful shutdown)
 */
export async function saveAllQueueSnapshots(): Promise<void> {
  const promises: Promise<void>[] = [];
  for (const guildId of voiceStates.keys()) {
    promises.push(
      saveQueueSnapshot(guildId).catch((e) =>
        log.error(`Failed to save snapshot for ${guildId}: ${(e as Error).message}`)
      )
    );
  }
  await Promise.all(promises);
  if (promises.length > 0) {
    log.info(`Saved ${promises.length} queue snapshot(s)`);
  }
}

/**
 * Delete queue snapshot after successful restore or when no longer needed
 */
async function deleteSnapshot(guildId: string): Promise<void> {
  try {
    await query('DELETE FROM guild_queue_snapshots WHERE guild_id = $1', [guildId]);
    log.debug(`Deleted snapshot for guild ${guildId}`);
  } catch (error) {
    log.warn(`Failed to delete snapshot for ${guildId}: ${(error as Error).message}`);
  }
}

/**
 * Restore queue snapshot from database
 */
export async function restoreQueueSnapshot(guildId: string, client: Client): Promise<boolean> {
  try {
    const result = await query('SELECT * FROM guild_queue_snapshots WHERE guild_id = $1', [
      guildId,
    ]);
    if (!result?.rows?.[0]) {
      log.debug(`No snapshot found for guild ${guildId}`);
      return false;
    }

    const snapshot = result.rows[0] as QueueSnapshot;

    // Check snapshot age - don't restore if older than 1 hour
    const snapshotAge = Date.now() - new Date(snapshot.saved_at).getTime();
    const ONE_HOUR_MS = 60 * 60 * 1000;
    if (snapshotAge > ONE_HOUR_MS) {
      log.info(
        `Snapshot for guild ${guildId} is too old (${Math.floor(snapshotAge / 60000)}m), deleting`
      );
      await deleteSnapshot(guildId);
      return false;
    }

    // Get guild from cache
    const guild = client.guilds.cache.get(guildId);
    if (!guild) {
      log.warn(`Guild ${guildId} not found in cache, deleting snapshot`);
      await deleteSnapshot(guildId);
      return false;
    }

    // Get voice channel
    const channel = guild.channels.cache.get(snapshot.channel_id);
    if (!channel?.isVoiceBased()) {
      log.warn(`Voice channel ${snapshot.channel_id} not found or invalid, deleting snapshot`);
      await deleteSnapshot(guildId);
      return false;
    }

    // Check if channel has any members (besides bots)
    const voiceChannel = channel as VoiceBasedChannel;
    const humanMembers = voiceChannel.members.filter((m) => !m.user.bot);
    if (humanMembers.size === 0) {
      log.info(`No users in voice channel for guild ${guildId}, skipping restore`);
      await deleteSnapshot(guildId);
      return false;
    }

    log.info(`Restoring queue for guild ${guildId}: channel ${voiceChannel.name}`);

    // Join the channel
    await joinChannel(voiceChannel);

    // Get the voice state that was just created
    const state = getVoiceState(guildId);
    if (!state) {
      log.error(`Failed to join channel for restore in guild ${guildId}`);
      return false;
    }

    // Parse queue data
    const queueData: Track[] = snapshot.queue_data ? JSON.parse(snapshot.queue_data) : [];
    const currentTrack: Track | null = snapshot.current_track
      ? JSON.parse(snapshot.current_track)
      : null;

    // Restore state
    state.queue = queueData;
    state.volume = snapshot.volume || 100;
    state.lastUserId = snapshot.last_user_id;

    // Resume playback with seek
    if (currentTrack) {
      const seekSeconds = Math.floor((snapshot.position_ms || 0) / 1000);

      // Dynamically import to avoid circular dependency
      const { playWithSeek } = await import('./playbackManager');
      await playWithSeek(state, currentTrack, seekSeconds, snapshot.is_paused);
      log.info(
        `Restored playback: "${currentTrack.title}" at ${seekSeconds}s, ${queueData.length} in queue`
      );
    } else if (state.queue.length > 0) {
      // No current track but queue has items - play next
      const { playNext } = await import('./playbackManager');
      await playNext(guildId);
      log.info(`Restored queue with ${state.queue.length} tracks, started playback`);
    }

    // Delete snapshot after successful restore
    await deleteSnapshot(guildId);

    return true;
  } catch (error) {
    log.error(`Failed to restore queue snapshot for ${guildId}: ${(error as Error).message}`);
    return false;
  }
}

/**
 * Restore all queue snapshots (called on bot startup)
 */
export async function restoreAllQueueSnapshots(client: Client): Promise<number> {
  try {
    const result = await query('SELECT guild_id FROM guild_queue_snapshots');
    if (!result?.rows?.length) {
      log.info('No queue snapshots to restore');
      return 0;
    }

    log.info(`Found ${result.rows.length} queue snapshot(s) to restore`);

    let restored = 0;
    for (const row of result.rows as Array<{ guild_id: string }>) {
      try {
        // Small delay between restores to avoid rate limiting
        if (restored > 0) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }

        if (await restoreQueueSnapshot(row.guild_id, client)) {
          restored++;
        }
      } catch (error) {
        log.error(`Failed to restore ${row.guild_id}: ${(error as Error).message}`);
      }
    }

    if (restored > 0) {
      log.info(`Successfully restored ${restored}/${result.rows.length} queue(s)`);
    }

    return restored;
  } catch (error) {
    log.error(`Failed to query queue snapshots: ${(error as Error).message}`);
    return 0;
  }
}
