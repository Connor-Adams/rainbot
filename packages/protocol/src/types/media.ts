/**
 * Canonical media model shared across workers and services.
 * This is the single source of truth for playback state and media items.
 */

export type SourceType = 'youtube' | 'spotify' | 'soundcloud' | 'local' | 'other';

export type MediaKind = 'music' | 'tts' | 'sfx';

export interface MediaRequester {
  userId: string;
  username?: string;
  discriminator?: string;
}

export interface MediaItem {
  kind?: MediaKind;
  title?: string;
  url?: string;
  source?: string;
  durationMs?: number;
  duration?: number;
  thumbnail?: string;
  sourceType?: SourceType;
  isLocal?: boolean;
  isSoundboard?: boolean;
  isStream?: boolean;
  userId?: string;
  username?: string;
  discriminator?: string;
  spotifyId?: string;
  spotifyUrl?: string;
  requestedBy?: MediaRequester;
  metadata?: Record<string, unknown>;
}

export type PlaybackStatus = 'idle' | 'buffering' | 'playing' | 'paused' | 'stopped' | 'error';

export interface PlaybackState {
  status: PlaybackStatus;
  positionMs?: number;
  durationMs?: number;
  volume?: number;
  rate?: number;
  overlayActive?: boolean;
  error?: string;
  updatedAt?: string;
}

export interface QueueState {
  nowPlaying?: MediaItem;
  queue: MediaItem[];
  history?: MediaItem[];
  isPaused?: boolean;
  isAutoplay?: boolean;
  loopMode?: 'off' | 'track' | 'queue';
  /** Current playback position in ms when something is playing. */
  positionMs?: number;
  /** Total duration of current track in ms when something is playing. */
  durationMs?: number;
}

export interface MediaWorkerState {
  connected: boolean;
  playback?: PlaybackState;
  queue?: QueueState;
  queueLength?: number;
  activeCount?: number;
}

export interface MediaState {
  guildId: string;
  channelId?: string | null;
  channelName?: string | null;
  connected?: boolean;
  kind: MediaKind;
  playback: PlaybackState;
  queue?: QueueState;
  workers?: Record<string, MediaWorkerState>;
}
