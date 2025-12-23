import { Client, GuildMember, VoiceChannel } from 'discord.js';
import { AudioPlayer, VoiceConnection } from '@discordjs/voice';

/**
 * Common type definitions used across the application
 */

// Audio Source Types
export type AudioSourceType = 'youtube' | 'soundcloud' | 'spotify' | 'file' | 'direct';

export interface AudioSource {
  type: AudioSourceType;
  url: string;
  title: string;
  duration?: number;
  thumbnail?: string;
  requestedBy: GuildMember;
}

// Voice Connection Types
export interface VoiceConnectionState {
  connection: VoiceConnection;
  player: AudioPlayer;
  channel: VoiceChannel;
  queue: AudioSource[];
  currentTrack: AudioSource | null;
  volume: number;
  isPaused: boolean;
  isLooping: boolean;
}

export interface VoiceManagerState {
  [guildId: string]: VoiceConnectionState;
}

// Queue Operation Types
export type QueueOperation = 'add' | 'remove' | 'skip' | 'clear' | 'pause' | 'resume';

export interface QueueOperationResult {
  success: boolean;
  message: string;
  queue?: AudioSource[];
}

// Statistics Types
export interface CommandStatistics {
  commandName: string;
  userId: string;
  guildId: string;
  success: boolean;
  timestamp: Date;
  executionTime?: number;
}

export interface SoundPlaybackStatistics {
  soundName: string;
  sourceType: AudioSourceType;
  userId: string;
  guildId: string;
  isSoundboard: boolean;
  timestamp: Date;
}

// Configuration Types
export interface BotConfig {
  token: string;
  clientId: string;
  guildId: string;
  dashboardPort: number;
  discordClientSecret?: string;
  requiredRoleId?: string;
  sessionSecret: string;
  spotifyClientId?: string;
  spotifyClientSecret?: string;
  databaseUrl?: string;
  redisUrl?: string;
  awsAccessKeyId?: string;
  awsSecretAccessKey?: string;
  awsRegion?: string;
  awsS3Bucket?: string;
}

// API Response Types
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
}

// Error Types
export class BotError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500
  ) {
    super(message);
    this.name = 'BotError';
  }
}

export class ValidationError extends BotError {
  constructor(message: string) {
    super(message, 'VALIDATION_ERROR', 400);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends BotError {
  constructor(message: string) {
    super(message, 'NOT_FOUND', 404);
    this.name = 'NotFoundError';
  }
}

export class UnauthorizedError extends BotError {
  constructor(message: string) {
    super(message, 'UNAUTHORIZED', 401);
    this.name = 'UnauthorizedError';
  }
}
