/**
 * Command parameter and result types
 */

import type { QueueInfo, VoiceStatus, PlayResult } from './voice.ts';

export interface PlayParams {
  guildId: string;
  source: string;
  userId: string | null;
  username?: string;
  discriminator?: string;
}

export interface PlayCommandResult {
  success: boolean;
  result?: PlayResult;
  error?: string;
}

export interface SkipParams {
  guildId: string;
  count: number;
}

export interface SkipResult {
  skipped: string[];
  nextUp: string;
}

export interface QueueCommandResult {
  queueInfo: QueueInfo;
  status: VoiceStatus | null;
}

export interface ClearResult {
  cleared: number;
  nowPlaying: string | null;
}

export interface PauseResult {
  paused: boolean;
  nowPlaying: string | null;
}

export interface StopResult {
  stopped: boolean;
}

export interface JoinParams {
  guildId: string;
  channelId: string;
  channelName: string;
}

export interface JoinResult {
  success: boolean;
  channelName?: string;
  error?: string;
}

export interface LeaveResult {
  success: boolean;
  channelName?: string;
  error?: string;
}

export interface PingResult {
  roundtrip: number;
  websocket: number;
}

export interface VolParams {
  guildId: string;
  level: number | null;
  userId?: string;
}

export interface VolResult {
  volume: number;
}
