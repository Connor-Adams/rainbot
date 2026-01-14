import type { HistoryEntry, ListeningHistoryRow, SourceType, Track } from './types';
import {
  deleteListeningHistoryByGuildSql,
  deleteListeningHistoryByUserSql,
  insertListeningHistorySql,
  selectListeningHistoryBaseSql,
  selectRecentHistorySql,
} from './sql';

export interface ListeningHistoryLogger {
  debug: (message: string) => void;
  error: (message: string) => void;
}

export interface ListeningHistoryRepo {
  saveHistory: (
    userId: string,
    guildId: string,
    queue: Track[],
    nowPlaying: string | null,
    currentTrack: Track | null
  ) => void;
  getHistory: (userId: string) => HistoryEntry | null;
  clearHistory: (userId: string) => void;
  trackPlayed: (
    userId: string,
    guildId: string,
    track: Track,
    queuedBy?: string | null
  ) => Promise<void>;
  getListeningHistory: (
    userId?: string | null,
    guildId?: string | null,
    limit?: number,
    startDate?: Date | null,
    endDate?: Date | null
  ) => Promise<ListeningHistoryRow[]>;
  getRecentHistory: (userId: string, guildId: string) => Promise<HistoryEntry | null>;
  clearListeningHistory: (userId: string, guildId?: string | null) => Promise<void>;
}

export interface ListeningHistoryRepoOptions {
  query: (text: string, params?: unknown[]) => Promise<{ rows: unknown[] } | null>;
  logger?: ListeningHistoryLogger;
  detectSourceType?: (track: Track) => SourceType;
}

const MAX_HISTORY_TRACKS = 50;

const defaultLogger: ListeningHistoryLogger = {
  debug: () => {},
  error: () => {},
};

function defaultDetectSourceType(track: Track): SourceType {
  if (track.isLocal) return 'local';
  if (!track.url) return 'other';

  const url = track.url.toLowerCase();
  if (url.includes('youtube.com') || url.includes('youtu.be')) return 'youtube';
  if (url.includes('spotify.com') || track.spotifyId) return 'spotify';
  if (url.includes('soundcloud.com')) return 'soundcloud';

  return 'other';
}

export function createListeningHistoryRepo({
  query,
  logger = defaultLogger,
  detectSourceType = defaultDetectSourceType,
}: ListeningHistoryRepoOptions): ListeningHistoryRepo {
  const userHistory = new Map<string, HistoryEntry>();

  function saveHistory(
    userId: string,
    guildId: string,
    queue: Track[],
    nowPlaying: string | null,
    currentTrack: Track | null
  ): void {
    if (!userId || !guildId) return;

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

    logger.debug(`Saved history for user ${userId} in guild ${guildId}`);
  }

  function getHistory(userId: string): HistoryEntry | null {
    if (!userId) return null;

    const history = userHistory.get(userId);
    if (!history) return null;

    const maxAge = 24 * 60 * 60 * 1000;
    if (Date.now() - history.timestamp > maxAge) {
      userHistory.delete(userId);
      logger.debug(`Deleted expired history for user ${userId}`);
      return null;
    }

    return history;
  }

  function clearHistory(userId: string): void {
    if (!userId) return;
    userHistory.delete(userId);
    logger.debug(`Cleared in-memory history for user ${userId}`);
  }

  async function trackPlayed(
    userId: string,
    guildId: string,
    track: Track,
    queuedBy: string | null = null
  ): Promise<void> {
    if (!userId || !guildId || !track) return;

    try {
      const sourceType = detectSourceType(track);
      const normalizedSource = track.source === 'api' ? 'api' : 'discord';

      await query(insertListeningHistorySql, [
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
      ]);

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
      logger.error(`Failed to track played track: ${err.message}`);
    }
  }

  async function getListeningHistory(
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
        `${selectListeningHistoryBaseSql} ${whereClause} ORDER BY lh.played_at DESC LIMIT $${paramIndex}`,
        params
      );

      return (result?.rows as ListeningHistoryRow[]) || [];
    } catch (error) {
      const err = error as Error;
      logger.error(`Failed to get listening history: ${err.message}`);
      return [];
    }
  }

  async function getRecentHistory(userId: string, guildId: string): Promise<HistoryEntry | null> {
    if (!userId || !guildId) return null;

    try {
      const result = await query(selectRecentHistorySql, [userId, guildId]);

      if (!result || result.rows.length === 0) {
        return null;
      }

      const rows = result.rows as ListeningHistoryRow[];
      const tracks = rows.reverse();
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
      logger.error(`Failed to get recent history: ${err.message}`);
      return null;
    }
  }

  async function clearListeningHistory(
    userId: string,
    guildId: string | null = null
  ): Promise<void> {
    if (!userId) return;

    try {
      if (guildId) {
        await query(deleteListeningHistoryByGuildSql, [userId, guildId]);
      } else {
        await query(deleteListeningHistoryByUserSql, [userId]);
      }

      clearHistory(userId);
      logger.debug(
        `Cleared listening history for user ${userId}${guildId ? ` in guild ${guildId}` : ''}`
      );
    } catch (error) {
      const err = error as Error;
      logger.error(`Failed to clear listening history: ${err.message}`);
    }
  }

  return {
    saveHistory,
    getHistory,
    clearHistory,
    trackPlayed,
    getListeningHistory,
    getRecentHistory,
    clearListeningHistory,
  };
}
