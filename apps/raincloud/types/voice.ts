/**
 * Voice manager type definitions
 * Legacy file - use voice-modules.ts for new voice module types.
 * Queue and track shapes align with @rainbot/types (canonical QueueState + MediaItem).
 */

import type { QueueState, MediaItem } from '@rainbot/types/media';

/** Canonical queue + now-playing (same as protocol QueueState). */
export type QueueInfo = QueueState;

/** Canonical track/media item (same as protocol MediaItem). */
export type Track = MediaItem;

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
