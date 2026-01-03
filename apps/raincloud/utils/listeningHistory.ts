import { createLogger } from './logger';
import { query } from './database';
import { detectSourceType, SourceType } from './sourceType';

const log = createLogger('HISTORY');

export interface Track {
  title?: string;
  url?: string;
  duration?: number;
  isLocal?: boolean;
  isSoundboard?: boolean;
  spotifyId?: string;
  spotifyUrl?: string;
  source?: string;
}

export interface HistoryEntry {
  guildId: string;
  queue: Track[];
  nowPlaying: string | null;
  currentTrack: Track | null;
  timestamp: number;
}

export interface ListeningHistoryRow {
  id: number;
  user_id: string;
  guild_id: string;
  track_title: string;
  track_url: string | null;
  source_type: SourceType;
  is_soundboard: boolean;
  duration: number | null;
  played_at: Date;
  source: string;
  queued_by: string | null;
  metadata: unknown;
  username?: string;
  discriminator?: string;
}

// Map of userId -> { guildId, queue, nowPlaying, timestamp } (for in-memory quick access)
const userHistory = new Map<string, HistoryEntry>();

// Maximum number of tracks to store in in-memory history
const MAX_HISTORY_TRACKS = 50;

/**
 * Save listening history for a user
 */
export function saveHistory(
  userId: string,
  guildId: string,
  queue: Track[],
  nowPlaying: string | null,
  currentTrack: Track | null
): void {
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
 */
export function getHistory(userId: string): HistoryEntry | null {
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
 */
export function clearHistory(userId: string): void {
  if (!userId) return;
  userHistory.delete(userId);
  log.debug(`Cleared in-memory history for user ${userId}`);
}

/**
 * Track a track being played (adds to persistent database history)
 */
export async function trackPlayed(
  userId: string,
  guildId: string,
  track: Track,
  queuedBy: string | null = null
): Promise<void> {
  if (!userId || !guildId || !track) return;

  try {
    // Determine source type using shared utility
    const sourceType = detectSourceType(track);

    // Normalize source to match database constraint (only 'discord' or 'api' allowed)
    // 'autoplay' and other sources from Discord bot features should be 'discord'
    const normalizedSource = track.source === 'api' ? 'api' : 'discord';

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
        normalizedSource,
        queuedBy || null,
        track.spotifyId || track.spotifyUrl
          ? JSON.stringify({ spotifyId: track.spotifyId, spotifyUrl: track.spotifyUrl })
          : null,
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
    history.nowPlaying = track.title || null;
    history.currentTrack = track;
    history.timestamp = Date.now();

    userHistory.set(userId, history);
  } catch (error) {
    const err = error as Error;
    log.error(`Failed to track played track: ${err.message}`);
  }
}

/**
 * Get listening history from database
 */
export async function getListeningHistory(
  userId: string | null = null,
  guildId: string | null = null,
  limit: number = 100,
  startDate: Date | null = null,
  endDate: Date | null = null
): Promise<ListeningHistoryRow[]> {
  try {
    const params: unknown[] = [];
    const conditions: string[] = [];
    let paramIndex = 1;

    if (userId) {
      conditions.push(`lh.user_id = $${paramIndex++}`);
      params.push(userId);
    }

    if (guildId) {
      conditions.push(`lh.guild_id = $${paramIndex++}`);
      params.push(guildId);
    }

    if (startDate) {
      conditions.push(`lh.played_at >= $${paramIndex++}`);
      params.push(startDate);
    }

    if (endDate) {
      conditions.push(`lh.played_at <= $${paramIndex++}`);
      params.push(endDate);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(limit);

    const result = await query(
      `SELECT lh.*, up.username, up.discriminator
            FROM listening_history lh
            LEFT JOIN user_profiles up ON lh.user_id = up.user_id
            ${whereClause}
            ORDER BY lh.played_at DESC
            LIMIT $${paramIndex}`,
      params
    );

    return (result?.rows as ListeningHistoryRow[]) || [];
  } catch (error) {
    const err = error as Error;
    log.error(`Failed to get listening history: ${err.message}`);
    return [];
  }
}

/**
 * Get recent listening history for a user (last session)
 */
export async function getRecentHistory(
  userId: string,
  guildId: string
): Promise<HistoryEntry | null> {
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

    const rows = result.rows as ListeningHistoryRow[];
    const tracks = rows.reverse(); // Oldest first
    const lastTrack = tracks[tracks.length - 1];

    if (!lastTrack) {
      return null;
    }

    return {
      guildId,
      queue: tracks.slice(0, -1).map((row) => ({
        title: row.track_title,
        url: row.track_url || undefined,
        duration: row.duration || undefined,
        isLocal: row.source_type === 'local',
      })),
      nowPlaying: lastTrack.track_title,
      currentTrack: {
        title: lastTrack.track_title,
        url: lastTrack.track_url || undefined,
        duration: lastTrack.duration || undefined,
        isLocal: lastTrack.source_type === 'local',
      },
      timestamp: lastTrack.played_at.getTime(),
    };
  } catch (error) {
    const err = error as Error;
    log.error(`Failed to get recent history: ${err.message}`);
    return null;
  }
}

/**
 * Clear listening history for a user
 */
export async function clearListeningHistory(
  userId: string,
  guildId: string | null = null
): Promise<void> {
  if (!userId) return;

  try {
    if (guildId) {
      await query('DELETE FROM listening_history WHERE user_id = $1 AND guild_id = $2', [
        userId,
        guildId,
      ]);
    } else {
      await query('DELETE FROM listening_history WHERE user_id = $1', [userId]);
    }

    // Also clear in-memory history
    clearHistory(userId);
    log.debug(
      `Cleared listening history for user ${userId}${guildId ? ` in guild ${guildId}` : ''}`
    );
  } catch (error) {
    const err = error as Error;
    log.error(`Failed to clear listening history: ${err.message}`);
  }
}
