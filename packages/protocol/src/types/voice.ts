/**
 * Voice manager type definitions
 * Legacy file - use voice-modules.ts for new voice module types
 */

import type { MediaItem, MediaState, QueueState } from './media';

export enum TrackKind {
  Music = 'music',
  Soundboard = 'soundboard',
  Local = 'local',
}

export type Track = MediaItem;

export type QueueInfo = QueueState;

export type VoiceStatus = MediaState;

export interface PlayResult {
  added: number;
  items: MediaItem[];
  queue: QueueState;
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
