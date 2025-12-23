import { Client } from 'discord.js';
import { Pool } from 'pg';
import { RedisClientType } from 'redis';
import { Logger } from 'winston';
import {
  AudioSource,
  VoiceConnectionState,
  QueueOperationResult,
  CommandStatistics,
  SoundPlaybackStatistics,
  BotConfig,
} from './common';

/**
 * Service interface definitions for dependency injection
 */

// Logger Service
export interface ILoggerService {
  info(message: string, meta?: Record<string, unknown>): void;
  error(message: string, error?: Error, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  debug(message: string, meta?: Record<string, unknown>): void;
}

// Database Service
export interface IDatabaseService {
  getPool(): Pool;
  query<T>(text: string, params?: unknown[]): Promise<T[]>;
  transaction<T>(callback: (client: Pool) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

// Cache Service
export interface ICacheService {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, ttl?: number): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
  exists(key: string): Promise<boolean>;
}

// Voice Manager Service
export interface IVoiceManagerService {
  joinChannel(guildId: string, channelId: string): Promise<VoiceConnectionState>;
  leaveChannel(guildId: string): Promise<void>;
  playAudio(guildId: string, source: AudioSource): Promise<void>;
  addToQueue(guildId: string, source: AudioSource): Promise<QueueOperationResult>;
  skipTrack(guildId: string): Promise<QueueOperationResult>;
  pausePlayback(guildId: string): Promise<QueueOperationResult>;
  resumePlayback(guildId: string): Promise<QueueOperationResult>;
  clearQueue(guildId: string): Promise<QueueOperationResult>;
  getQueue(guildId: string): AudioSource[];
  getConnectionState(guildId: string): VoiceConnectionState | undefined;
}

// Statistics Service
export interface IStatisticsService {
  recordCommand(stats: CommandStatistics): Promise<void>;
  recordSoundPlayback(stats: SoundPlaybackStatistics): Promise<void>;
  getTopCommands(limit?: number): Promise<Array<{ command: string; count: number }>>;
  getTopSounds(limit?: number): Promise<Array<{ sound: string; count: number }>>;
  getUserActivity(userId: string): Promise<unknown>;
  flushAll(): Promise<void>;
}

// Audio Service
export interface IAudioService {
  resolveSource(url: string): Promise<AudioSource | null>;
  validateUrl(url: string): boolean;
  getSupportedSourceTypes(): AudioSourceType[];
  downloadAudio(url: string, destination: string): Promise<string>;
}

// Storage Service (for S3 or local file storage)
export interface IStorageService {
  upload(file: Buffer, fileName: string): Promise<string>;
  download(fileName: string): Promise<Buffer>;
  delete(fileName: string): Promise<void>;
  list(prefix?: string): Promise<string[]>;
  exists(fileName: string): Promise<boolean>;
}

// Config Service
export interface IConfigService {
  get<K extends keyof BotConfig>(key: K): BotConfig[K];
  getAll(): BotConfig;
  validate(): boolean;
}
