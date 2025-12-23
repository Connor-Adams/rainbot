// Service type definitions
import type { AudioPlayerStatus } from '@discordjs/voice';

export interface AudioSource {
  type: 'youtube' | 'spotify' | 'soundcloud' | 'local';
  url?: string;
  path?: string;
}

export interface AudioMetadata {
  title: string;
  duration?: number;
  thumbnail?: string;
  artist?: string;
}

export interface PlaybackState {
  status: AudioPlayerStatus;
  position?: number;
  duration?: number;
}

export interface ServiceHealth {
  service: string;
  status: 'healthy' | 'degraded' | 'down';
  message?: string;
  lastCheck: Date;
}

export interface CacheEntry<T> {
  data: T;
  expires: number;
}

export interface RateLimitInfo {
  limit: number;
  remaining: number;
  reset: Date;
}

export interface QueueOperation {
  type: 'add' | 'remove' | 'clear' | 'skip';
  userId: string;
  guildId: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

export interface VoiceConnectionInfo {
  guildId: string;
  channelId: string;
  channelName: string;
  status: 'connected' | 'connecting' | 'disconnected';
  memberCount?: number;
}

export interface TrackStatistics {
  trackId: string;
  title: string;
  plays: number;
  skips: number;
  completions: number;
  avgListenTime?: number;
  sourceType: AudioSource['type'];
}
