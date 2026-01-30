import type { SourceType } from '@rainbot/types/media';

export type { SourceType };

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
