/**
 * Voice-related type definitions
 */

export interface Track {
  title: string;
  url: string;
  duration?: number;
  isLocal?: boolean;
  isSoundboard?: boolean;
}

export interface QueueInfo {
  nowPlaying: string | null;
  queue: Track[];
  totalInQueue: number;
  currentTrack: Track | null;
  playbackPosition: number;
  hasOverlay: boolean;
  isPaused: boolean;
  channelName: string | null;
}

export interface VoiceStatus {
  channelId: string | null;
  channelName: string | null;
  nowPlaying: string | null;
  isPlaying: boolean;
  queueLength: number;
}

export interface PlayResult {
  added: number;
  totalInQueue: number;
  tracks: Track[];
}

