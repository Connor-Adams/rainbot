/* eslint-disable @typescript-eslint/no-unused-vars */
/**
 * Voice Interaction Manager - Orchestrates voice command processing
 * Handles audio receiving, STT, command parsing, execution, and TTS responses
 */

import { VoiceConnection, EndBehaviorType } from '@discordjs/voice';
import type { Client } from 'discord.js';
import { createLogger } from '../logger';
import type {
  VoiceInteractionConfig,
  VoiceInteractionState,
  VoiceInteractionSession,
  AudioChunk,
  ParsedVoiceCommand,
  VoiceCommandResult,
  IVoiceInteractionManager,
} from '../../types/voice-interaction';
import { SpeechRecognitionManager } from './speechRecognition';
import { TextToSpeechManager, generateResponseText } from './textToSpeech';
import { parseVoiceCommand, validateVoiceCommand } from './voiceCommandParser';
import { Mutex } from 'async-mutex';

const log = createLogger('VOICE_INTERACTION');

/**
 * Default configuration for voice interactions
 */
const DEFAULT_CONFIG: VoiceInteractionConfig = {
  enabled: false,
  sttProvider: 'openai',
  ttsProvider: 'openai',
  language: 'en-US',
  maxAudioDuration: 10, // 10 seconds max
  minAudioDuration: 0.5, // 0.5 second min (Whisper needs at least 0.1s)
  confidenceThreshold: 0.6,
  rateLimit: {
    maxCommandsPerMinute: 10,
    maxCommandsPerHour: 60,
  },
};

/**
 * Voice Interaction Manager
 */
export class VoiceInteractionManager implements IVoiceInteractionManager {
  private config: VoiceInteractionConfig;
  private states: Map<string, VoiceInteractionState>;
  private speechRecognition: SpeechRecognitionManager;
  private textToSpeech: TextToSpeechManager;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private voiceManager: any; // Lazy loaded to avoid circular dependency
  private commandMutex: Mutex;

  constructor(_client: Client, config?: Partial<VoiceInteractionConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.states = new Map();
    this.commandMutex = new Mutex();

    // Initialize STT and TTS
    this.speechRecognition = new SpeechRecognitionManager(this.config);
    this.textToSpeech = new TextToSpeechManager(this.config);

    log.info('Voice Interaction Manager initialized');
  }

  /**
   * Lazy load voice manager to avoid circular dependency
   */
  private getVoiceManager() {
    if (!this.voiceManager) {
      // Use relative import to avoid hard-coded dist path
      try {
        this.voiceManager = require('../voiceManager');
      } catch (_error) {
        // Fallback to dist path for compatibility
        this.voiceManager = require('../../dist/utils/voiceManager');
      }
    }
    return this.voiceManager;
  }

  /**
   * Enable voice interactions for a guild
   */
  async enableForGuild(guildId: string): Promise<void> {
    log.info(`Enabling voice interactions for guild ${guildId}`);

    if (!this.states.has(guildId)) {
      this.states.set(guildId, {
        guildId,
        enabled: true,
        sessions: new Map(),
        commandQueue: [],
        ttsQueue: [],
        isProcessingCommand: false,
        isSpeaking: false,
        statistics: {
          totalCommands: 0,
          successfulCommands: 0,
          failedCommands: 0,
          averageLatency: 0,
        },
      });
    } else {
      const state = this.states.get(guildId)!;
      state.enabled = true;
    }

    // Preload common TTS responses
    await this.textToSpeech.preloadCommonResponses();

    log.info(`Voice interactions enabled for guild ${guildId}`);
  }

  /**
   * Disable voice interactions for a guild
   */
  async disableForGuild(guildId: string): Promise<void> {
    log.info(`Disabling voice interactions for guild ${guildId}`);

    const state = this.states.get(guildId);
    if (state) {
      state.enabled = false;

      // Stop all active sessions
      for (const [userId] of state.sessions) {
        await this.stopListening(userId, guildId);
      }
    }

    log.info(`Voice interactions disabled for guild ${guildId}`);
  }

  /**
   * Check if voice interactions are enabled for a guild
   */
  isEnabledForGuild(guildId: string): boolean {
    const state = this.states.get(guildId);
    return state?.enabled ?? false;
  }

  /**
   * Start listening to a user in a voice channel
   */
  async startListening(
    userId: string,
    guildId: string,
    connection: VoiceConnection
  ): Promise<void> {
    if (!this.isEnabledForGuild(guildId)) {
      log.debug(`Voice interactions not enabled for guild ${guildId}`);
      return;
    }

    const state = this.states.get(guildId);
    if (!state) {
      throw new Error(`No voice interaction state for guild ${guildId}`);
    }

    log.info(`Starting to listen to user ${userId} in guild ${guildId}`);

    // Create session
    const session: VoiceInteractionSession = {
      userId,
      guildId,
      channelId: connection.joinConfig.channelId!,
      username: 'User', // Will be updated when we get user info
      isListening: true,
      audioBuffer: [],
      lastCommandTime: Date.now(),
      consecutiveFailures: 0,
    };

    state.sessions.set(userId, session);

    // Set up voice receiver
    const receiver = connection.receiver;

    // Subscribe to user's audio
    const audioStream = receiver.subscribe(userId, {
      end: {
        behavior: EndBehaviorType.AfterSilence,
        duration: 3000, // 3 seconds of silence ends the stream
      },
    });

    log.debug(`Subscribed to audio from user ${userId}`);

    // Track when audio actually starts coming in
    let firstChunkReceived = false;

    // Process audio chunks
    let chunkSequence = 0;
    let lastLogTime = Date.now();
    let totalBytesReceived = 0;
    audioStream.on('data', (chunk: Buffer) => {
      if (!session.isListening) return;

      if (!firstChunkReceived) {
        log.info(`🎙️ First audio chunk received from user ${userId} (${chunk.length} bytes)`);
        firstChunkReceived = true;
      }

      totalBytesReceived += chunk.length;

      // Log audio capture with detailed stats
      const now = Date.now();
      if (now - lastLogTime > 500) {
        const durationSoFar = totalBytesReceived / 192000;
        log.debug(
          `🎤 Hearing audio from user ${userId} - ${session.audioBuffer.length} chunks, ${totalBytesReceived} bytes, ${durationSoFar.toFixed(2)}s`
        );
        lastLogTime = now;
      }

      // Log individual chunk sizes for debugging
      if (chunk.length < 100) {
        log.warn(`⚠️ Very small audio chunk: ${chunk.length} bytes`);
      }

      const audioChunk: AudioChunk = {
        userId,
        guildId,
        timestamp: Date.now(),
        buffer: chunk,
        sequence: chunkSequence++,
      };

      this.processAudioChunk(audioChunk).catch((error) => {
        log.error(`Error processing audio chunk: ${(error as Error).message}`);
      });
    });

    // Handle stream end (user stopped speaking)
    audioStream.on('end', async () => {
      log.info(
        `🔇 Silence detected for user ${userId} - processing ${session.audioBuffer.length} chunks`
      );

      if (session.audioBuffer.length > 0) {
        await this.processCompleteAudio(session);
      }
    });

    audioStream.on('error', (error) => {
      log.error(`Audio stream error for user ${userId}: ${error.message}`);
    });
  }

  /**
   * Stop listening to a user
   */
  async stopListening(userId: string, guildId: string): Promise<void> {
    log.info(`Stopping listening to user ${userId} in guild ${guildId}`);

    const state = this.states.get(guildId);
    if (!state) return;

    const session = state.sessions.get(userId);
    if (session) {
      session.isListening = false;
      session.audioBuffer = [];
      state.sessions.delete(userId);
    }
  }

  /**
   * Process audio chunk from a user
   */
  async processAudioChunk(chunk: AudioChunk): Promise<void> {
    const state = this.states.get(chunk.guildId);
    if (!state) return;

    const session = state.sessions.get(chunk.userId);
    if (!session || !session.isListening) return;

    // Add chunk to buffer
    session.audioBuffer.push(chunk.buffer);

    // Check if we've exceeded max duration
    const totalDuration = session.audioBuffer.length * 0.02; // ~20ms per chunk
    if (totalDuration > this.config.maxAudioDuration) {
      log.warn(`Audio buffer exceeded max duration for user ${chunk.userId}, processing now`);
      await this.processCompleteAudio(session);
    }
  }

  /**
   * Process complete audio from a session (after silence detected)
   */
  private async processCompleteAudio(session: VoiceInteractionSession): Promise<void> {
    const audioBuffers = session.audioBuffer;
    session.audioBuffer = []; // Clear buffer

    if (audioBuffers.length === 0) return;

    // Calculate actual duration from total bytes
    // Stereo PCM: 16-bit (2 bytes) × 2 channels × 48000 Hz = 192000 bytes per second
    const totalBytes = audioBuffers.reduce((sum, buf) => sum + buf.length, 0);
    const totalDuration = totalBytes / 192000;

    // Check minimum duration (note: this is before mono conversion, so ~0.5s will become ~0.25s of mono)
    if (totalDuration < this.config.minAudioDuration) {
      log.debug(`Audio too short (${totalDuration.toFixed(3)}s / ${totalBytes} bytes), ignoring`);
      return;
    }

    log.info(
      `📊 Processing ${audioBuffers.length} audio chunks (${totalDuration.toFixed(3)}s / ${totalBytes} bytes) from user ${session.userId}`
    );

    try {
      // Convert audio to text
      log.info(`🔄 Transcribing audio...`);
      const result = await this.speechRecognition.processDiscordAudio(audioBuffers);

      if (!result.text || result.text.trim().length === 0) {
        log.warn('❌ No speech detected in audio');
        return;
      }

      log.info(`✅ Transcribed: "${result.text}" (confidence: ${result.confidence.toFixed(2)})`);

      // Parse command
      log.debug(`🔍 Parsing voice command: "${result.text}"`);
      const command = parseVoiceCommand(result.text);

      // Validate command
      const validation = validateVoiceCommand(command, this.config.confidenceThreshold);
      if (!validation.valid) {
        log.warn(`Invalid command: ${validation.reason}`);
        await this.sendVoiceResponse(
          session.guildId,
          "I'm sorry, I didn't understand that. Try saying 'help' for available commands."
        );
        return;
      }

      // Execute command
      await this.executeVoiceCommand(session, command);
    } catch (error) {
      log.error(`Error processing audio: ${(error as Error).message}`);
      session.consecutiveFailures++;

      if (session.consecutiveFailures >= 3) {
        await this.sendVoiceResponse(
          session.guildId,
          "I'm having trouble understanding you. Voice commands are temporarily disabled."
        );
        await this.stopListening(session.userId, session.guildId);
      }
    }
  }

  /**
   * Execute a parsed voice command
   */
  private async executeVoiceCommand(
    session: VoiceInteractionSession,
    command: ParsedVoiceCommand
  ): Promise<VoiceCommandResult> {
    const startTime = Date.now();
    const state = this.states.get(session.guildId);

    if (!state) {
      throw new Error(`No state for guild ${session.guildId}`);
    }

    // Check rate limiting
    const timeSinceLastCommand = Date.now() - session.lastCommandTime;
    if (timeSinceLastCommand < 2000) {
      // Min 2 seconds between commands
      log.warn(`Rate limit: Command too soon after previous (${timeSinceLastCommand}ms)`);
      return {
        success: false,
        command,
        response: 'Please wait a moment before the next command.',
      };
    }

    session.lastCommandTime = Date.now();
    state.statistics.totalCommands++;

    // Use mutex to prevent concurrent command execution
    const release = await this.commandMutex.acquire();

    try {
      state.isProcessingCommand = true;

      log.info(`⚡ Executing voice command: ${command.type} (query: ${command.query || 'N/A'})`);

      const vm = this.getVoiceManager();
      let success = false;
      let responseText = '';

      switch (command.type) {
        case 'play':
          try {
            const result = await vm.playSound(
              session.guildId,
              command.query!,
              session.userId,
              'voice',
              session.username,
              ''
            );
            success = true;
            const track = result.tracks[0];
            responseText = generateResponseText('play', true, track?.title);
          } catch (_error) {
            responseText = generateResponseText('play', false);
          }
          break;

        case 'skip':
          try {
            const count = (command.parameter as number) || 1;
            await vm.skipTrack(session.guildId, count);
            success = true;
            responseText = generateResponseText('skip', true);
          } catch (_error) {
            responseText = generateResponseText('skip', false);
          }
          break;

        case 'pause':
          try {
            await vm.pausePlayback(session.guildId);
            success = true;
            responseText = generateResponseText('pause', true);
          } catch (_error) {
            responseText = generateResponseText('pause', false);
          }
          break;

        case 'resume':
          try {
            await vm.resumePlayback(session.guildId);
            success = true;
            responseText = generateResponseText('resume', true);
          } catch (_error) {
            responseText = generateResponseText('resume', false);
          }
          break;

        case 'stop':
          try {
            await vm.stopPlayback(session.guildId);
            success = true;
            responseText = generateResponseText('stop', true);
          } catch (_error) {
            responseText = generateResponseText('stop', false);
          }
          break;

        case 'queue':
          try {
            const queueInfo = vm.getQueue(session.guildId);
            const queueLength = queueInfo.queue.length;
            success = true;
            responseText =
              queueLength > 0
                ? `There are ${queueLength} tracks in the queue`
                : 'The queue is empty';
          } catch (_error) {
            responseText = generateResponseText('queue', false);
          }
          break;

        case 'volume':
          try {
            let volume = command.parameter as number;

            // Handle relative volume changes
            if (volume < 0 || volume > 100) {
              // This is a relative change (e.g., "turn it down" = -10)
              // Get current volume from voice state
              const voiceState = vm.getVoiceState?.(session.guildId);
              const currentVolume = voiceState?.volume || 50;
              volume = Math.max(0, Math.min(100, currentVolume + volume));
            }

            await vm.setVolume(session.guildId, volume);
            success = true;
            responseText = generateResponseText('volume', true, `Volume set to ${volume}`);
          } catch (_error) {
            responseText = generateResponseText('volume', false);
          }
          break;

        case 'clear':
          try {
            await vm.clearQueue(session.guildId);
            success = true;
            responseText = generateResponseText('clear', true);
          } catch (_error) {
            responseText = 'Nothing to clear';
          }
          break;

        case 'help':
          success = true;
          responseText = generateResponseText('help', true);
          break;

        default:
          responseText = generateResponseText('unknown', false);
      }

      // Update statistics
      if (success) {
        state.statistics.successfulCommands++;
        session.consecutiveFailures = 0;
      } else {
        state.statistics.failedCommands++;
        session.consecutiveFailures++;
      }

      const latency = Date.now() - startTime;
      const currentAvg = state.statistics.averageLatency;
      const totalCommands = state.statistics.totalCommands;
      state.statistics.averageLatency =
        (currentAvg * (totalCommands - 1) + latency) / totalCommands;

      log.info(`\u2705 Command ${success ? 'succeeded' : 'failed'} in ${latency}ms`);

      // Send voice response
      await this.sendVoiceResponse(session.guildId, responseText);

      return {
        success,
        command,
        response: responseText,
      };
    } finally {
      state.isProcessingCommand = false;
      release();
    }
  }

  /**
   * Send a voice response using TTS
   */
  private async sendVoiceResponse(guildId: string, text: string): Promise<void> {
    try {
      log.info(`🔊 Preparing TTS response: "${text}"`);

      // Generate TTS audio file
      log.debug(`🎙️ Synthesizing speech...`);
      const audioFile = await this.textToSpeech.synthesizeToFile(text);
      log.debug(`✅ TTS file generated: ${audioFile}`);

      // Play via voice manager (as a soundboard overlay)
      log.debug(`▶️ Playing TTS audio in voice channel...`);
      const vm = this.getVoiceManager();
      await vm.playSoundboardOverlay(
        guildId,
        audioFile,
        'system',
        'voice-interaction',
        'System',
        ''
      );
      log.info(`✅ TTS playback completed`);

      // Schedule cleanup
      setTimeout(() => {
        this.textToSpeech.cleanupFile(audioFile);
      }, 5000);
    } catch (error) {
      log.error(`Failed to send voice response: ${(error as Error).message}`);
    }
  }

  /**
   * Get interaction state for a guild
   */
  getState(guildId: string): VoiceInteractionState | null {
    return this.states.get(guildId) || null;
  }

  /**
   * Clean up resources for a guild
   */
  async cleanup(guildId: string): Promise<void> {
    log.info(`Cleaning up voice interactions for guild ${guildId}`);

    const state = this.states.get(guildId);
    if (state) {
      // Stop all sessions
      for (const [userId] of state.sessions) {
        await this.stopListening(userId, guildId);
      }

      this.states.delete(guildId);
    }
  }

  /**
   * Get statistics for a guild
   */
  getStatistics(guildId: string) {
    const state = this.states.get(guildId);
    return state?.statistics || null;
  }

  /**
   * Get all guild IDs with active voice interaction states
   */
  getAllGuildIds(): string[] {
    return Array.from(this.states.keys());
  }
}

/**
 * Create voice interaction manager instance
 */
export function createVoiceInteractionManager(
  client: Client,
  config?: Partial<VoiceInteractionConfig>
): VoiceInteractionManager {
  return new VoiceInteractionManager(client, config);
}
