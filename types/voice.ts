/**
 * Voice manager type definitions
 * Legacy file - use voice-modules.ts for new voice module types
 */

export interface Track {
  title: string;
  url?: string;
  duration?: number;
  isLocal?: boolean;
  isSoundboard?: boolean;
  source?: 'youtube' | 'soundcloud' | 'spotify' | 'local' | 'other';
}

export interface QueueInfo {
  nowPlaying: string | null;
  queue: Track[];
  totalInQueue?: number;
  playbackPosition?: number;
  hasOverlay?: boolean;
  channelName?: string | null;
  currentTrack?: Track | null;
  isPaused?: boolean;
}

export interface VoiceStatus {
  channelId: string;
  channelName: string;
  nowPlaying: string | null;
  isPlaying: boolean;
  queueLength: number;
}

export interface PlayResult {
  added: number;
  tracks: Track[];
  totalInQueue: number;
  overlaid?: boolean;
}

export interface LeaveResult {
  success: boolean;
  guildId: string;
}

export interface StopResult {
  success: boolean;
  cleared: number;
}
