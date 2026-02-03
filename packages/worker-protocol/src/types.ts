/**
 * Common request/response types for worker protocol
 */

import type { BotType } from '@rainbot/types/core';

export type { BotType };

export type WorkerStatus = 'joined' | 'already_connected' | 'error' | 'left' | 'not_connected';

/**
 * Request to join a voice channel
 */
export interface JoinRequest {
  requestId: string;
  guildId: string;
  channelId: string;
}

export interface JoinResponse {
  status: WorkerStatus;
  message?: string;
  channelId?: string;
}

/**
 * Request to leave a voice channel
 */
export interface LeaveRequest {
  requestId: string;
  guildId: string;
}

export interface LeaveResponse {
  status: WorkerStatus;
  message?: string;
}

/**
 * Request to set volume
 */
export interface VolumeRequest {
  requestId: string;
  guildId: string;
  volume: number; // 0.0 - 1.0
}

export interface VolumeResponse {
  status: 'success' | 'error';
  message?: string;
  volume?: number;
}

/**
 * Request for status information
 */
export interface StatusRequest {
  guildId: string;
}

export interface StatusResponse {
  connected: boolean;
  channelId?: string;
  playing: boolean;
  queueLength?: number;
  volume?: number;
}

/**
 * Health check response
 */
export interface HealthResponse {
  status: 'ok' | 'unhealthy';
  uptime: number;
  botType: BotType;
  timestamp: number;
}

// ============================================================================
// Music Bot Specific (Rainbot)
// ============================================================================

export interface EnqueueTrackRequest {
  requestId: string;
  guildId: string;
  url: string;
  requestedBy: string;
  requestedByUsername?: string;
}

export interface EnqueueTrackResponse {
  status: 'success' | 'error';
  message?: string;
  position?: number;
}

// ============================================================================
// TTS Bot Specific (Pranjeet)
// ============================================================================

export interface SpeakRequest {
  requestId: string;
  guildId: string;
  text: string;
  voice?: string;
  speed?: number;
  userId?: string;
}

export interface SpeakResponse {
  status: 'success' | 'error';
  message?: string;
}

// ============================================================================
// Soundboard Bot Specific (HungerBot)
// ============================================================================

export interface PlaySoundRequest {
  requestId: string;
  guildId: string;
  userId: string;
  sfxId: string;
  volume?: number;
}

export interface PlaySoundResponse {
  status: 'success' | 'error';
  message?: string;
}

export interface CleanupUserRequest {
  guildId: string;
  userId: string;
}

export interface CleanupUserResponse {
  status: 'success' | 'error';
  message?: string;
}

// Rainbot-only command responses (used by RPC)
export interface SkipResponse {
  status: 'success' | 'error';
  message?: string;
  skipped?: string[];
}

export interface PauseResponse {
  status: 'success' | 'error';
  message?: string;
  paused?: boolean;
}

export interface StopResponse {
  status: 'success' | 'error';
  message?: string;
}

export interface ClearResponse {
  status: 'success' | 'error';
  message?: string;
  cleared?: number;
}

export interface AutoplayResponse {
  status: 'success' | 'error';
  message?: string;
  enabled?: boolean;
}

export interface ReplayResponse {
  status: 'success' | 'error';
  message?: string;
  track?: string;
}

export interface SeekRequest {
  requestId: string;
  guildId: string;
  positionSeconds: number;
}

export interface SeekResponse {
  status: 'success' | 'error';
  message?: string;
}

/**
 * Minimal queue payload for RPC getQueue (compatible with coordinator normalizeQueueState).
 * Contract: getQueue returns QueueResponse with nowPlaying as QueueItemPayload (object), not string.
 * When something is playing, positionMs/durationMs may be set for progress display.
 */
export interface QueueItemPayload {
  title?: string;
  url?: string;
  durationMs?: number;
  duration?: number;
  sourceType?: string;
  userId?: string;
  username?: string;
  [key: string]: unknown;
}

export interface QueueResponse {
  queue: QueueItemPayload[];
  nowPlaying?: QueueItemPayload;
  isPaused?: boolean;
  isAutoplay?: boolean;
  /** Current playback position in ms when something is playing. */
  positionMs?: number;
  /** Total duration of current track in ms when something is playing. */
  durationMs?: number;
}
