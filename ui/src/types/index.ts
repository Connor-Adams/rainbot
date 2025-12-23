// API Response Types
export interface Guild {
  id: string;
  name: string;
  memberCount: number;
}

export interface Connection {
  guildId: string;
  channelId: string;
  channelName: string;
  nowPlaying?: string;
}

export interface Sound {
  name: string;
  size: number;
}

export interface Track {
  title: string;
  url?: string;
  duration?: number;
  isLocal?: boolean;
  spotifyUrl?: string;
  spotifyId?: string;
}

export interface QueueData {
  nowPlaying: string | null;
  currentTrack?: Track;
  queue: Track[];
  totalInQueue: number;
  isPaused?: boolean;
}

export interface BotStatus {
  online: boolean;
  username?: string;
  discriminator?: string;
  guilds: Guild[];
  connections: Connection[];
}

export interface User {
  id: string;
  username: string;
  discriminator: string;
  avatarUrl: string;
}

export interface StatsSummary {
  totalCommands: number;
  totalSounds: number;
  uniqueUsers: number;
  uniqueGuilds: number;
  successRate: number;
  timeRange?: {
    start: string | null;
    end: string | null;
  };
}

export interface CommandStat {
  command_name: string;
  count: string;
  success_count: string;
  error_count: string;
}

export interface SoundStat {
  sound_name: string;
  count: string;
  avg_duration?: string;
  total_duration?: string;
}

export interface SourceType {
  source_type: string;
  count: string;
}

export interface SoundboardBreakdown {
  is_soundboard: boolean;
  count: string;
}

export interface UserStat {
  user_id: string;
  username?: string;
  discriminator?: string;
  guild_id: string;
  command_count: string;
  sound_count: string;
  last_active?: string;
}

export interface GuildStat {
  guild_id: string;
  command_count: string;
  sound_count: string;
  unique_users: string;
  last_active?: string;
}

export interface QueueOperation {
  operation_type: string;
  count: string;
}

export interface TimeDataPoint {
  date: string;
  command_count?: string;
  sound_count?: string;
}

export interface ListeningHistoryEntry {
  track_title: string;
  source_type: string;
  duration?: number;
  queued_by?: string;
  played_at: string;
  is_soundboard?: boolean;
}
