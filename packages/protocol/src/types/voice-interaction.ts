/**
 * Type definitions for voice interaction system
 */

import type { VoiceConnection } from '@discordjs/voice';

/**
 * Voice command types that can be recognized
 */
export type VoiceCommandType =
  | 'play'
  | 'skip'
  | 'pause'
  | 'resume'
  | 'stop'
  | 'queue'
  | 'volume'
  | 'clear'
  | 'help'
  | 'unknown';

/**
 * Parsed voice command with extracted parameters
 */
export interface ParsedVoiceCommand {
  type: VoiceCommandType;
  query?: string; // For play commands: song name/artist
  parameter?: string | number; // For volume: number, for skip: count
  confidence: number; // 0-1 confidence score
  rawText: string; // Original transcribed text
}

/**
 * Voice interaction session for a user in a guild
 */
export interface VoiceInteractionSession {
  userId: string;
  guildId: string;
  channelId: string;
  username: string;
  isListening: boolean;
  audioBuffer: Buffer[];
  lastCommandTime: number;
  consecutiveFailures: number;
}

/**
 * Configuration for voice interaction features
 */
export interface VoiceInteractionConfig {
  enabled: boolean;
  sttProvider: 'google' | 'azure' | 'aws' | 'whisper' | 'openai';
  ttsProvider: 'google' | 'azure' | 'aws' | 'polly' | 'openai' | 'pranjeet';
  sttApiKey?: string;
  ttsApiKey?: string;
  language: string; // e.g., 'en-US'
  voiceName?: string; // TTS voice name
  maxAudioDuration: number; // Max seconds of audio to process
  minAudioDuration: number; // Min seconds before processing
  confidenceThreshold: number; // Min confidence to act on command (0-1)
  recordAudio?: boolean; // Save audio to disk for debugging
  enabledGuilds?: string[]; // Whitelist of guild IDs (empty = all)
  rateLimit: {
    maxCommandsPerMinute: number;
    maxCommandsPerHour: number;
  };
}

/**
 * Speech-to-text result
 */
export interface SpeechRecognitionResult {
  text: string;
  confidence: number;
  alternatives?: Array<{ text: string; confidence: number }>;
  isFinal: boolean;
  languageCode?: string;
}

/**
 * Text-to-speech request
 */
export interface TextToSpeechRequest {
  text: string;
  voiceName?: string;
  languageCode?: string;
  pitch?: number;
  speakingRate?: number;
}

/**
 * Text-to-speech result
 */
export interface TextToSpeechResult {
  audioBuffer: Buffer;
  duration?: number;
  format: 'pcm' | 'mp3' | 'wav' | 'ogg';
  sampleRate: number;
}

/**
 * Voice command execution result
 */
export interface VoiceCommandResult {
  success: boolean;
  command: ParsedVoiceCommand;
  response: string; // Text response to speak back
  error?: string;
}

/**
 * Voice interaction state per guild
 */
export interface VoiceInteractionState {
  guildId: string;
  enabled: boolean;
  sessions: Map<string, VoiceInteractionSession>;
  commandQueue: ParsedVoiceCommand[];
  ttsQueue: Array<{ text: string; priority: number }>;
  isProcessingCommand: boolean;
  isSpeaking: boolean;
  statistics: {
    totalCommands: number;
    successfulCommands: number;
    failedCommands: number;
    averageLatency: number;
  };
}

/**
 * Audio chunk from voice receiver
 */
export interface AudioChunk {
  userId: string;
  guildId: string;
  timestamp: number;
  buffer: Buffer;
  sequence: number;
}

/**
 * Voice interaction manager interface
 */
export interface IVoiceInteractionManager {
  /**
   * Enable voice interactions for a guild
   */
  enableForGuild(guildId: string): Promise<void>;

  /**
   * Disable voice interactions for a guild
   */
  disableForGuild(guildId: string): Promise<void>;

  /**
   * Check if voice interactions are enabled for a guild
   */
  isEnabledForGuild(guildId: string): boolean;

  /**
   * Start listening to a user in a voice channel
   */
  startListening(userId: string, guildId: string, connection: VoiceConnection): Promise<void>;

  /**
   * Stop listening to a user
   */
  stopListening(userId: string, guildId: string): Promise<void>;

  /**
   * Process audio chunk from a user
   */
  processAudioChunk(chunk: AudioChunk): Promise<void>;

  /**
   * Get interaction state for a guild
   */
  getState(guildId: string): VoiceInteractionState | null;

  /**
   * Clean up resources for a guild
   */
  cleanup(guildId: string): Promise<void>;
}
