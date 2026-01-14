/**
 * Voice manager type definitions
 * Legacy file - use voice-modules.ts for new voice module types
 */

export enum TrackKind {
  Music = 'music',
  Soundboard = 'soundboard',
  Local = 'local',
}

export interface Track {
  title: string;

  /** Remote URL (YouTube, SoundCloud, etc.) */
  url?: string;

  /** Local filename or stream identifier */
  source?: string;

  /** Duration in seconds (if known) */
  duration?: number;

  /** Canonical classification */
  kind?: TrackKind;

  /** Legacy flags used by runtime helpers */
  isLocal?: boolean;
  isSoundboard?: boolean;
  isStream?: boolean;

  /** Source metadata */
  sourceType?: 'youtube' | 'soundcloud' | 'spotify' | 'local' | 'other';

  /** User metadata */
  userId?: string;
  username?: string;
  discriminator?: string;

  /** Spotify metadata */
  spotifyId?: string;
  spotifyUrl?: string;
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
  autoplay?: boolean;
}

export interface VoiceStatus {
  channelId: string;
  channelName: string;
  nowPlaying: string | null;
  isPlaying: boolean;
  queueLength: number;
  canReplay: boolean;
  lastPlayedTitle: string | null;
  autoplay: boolean;
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
