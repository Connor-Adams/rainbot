// util-category: audio
/**
 * Voice Interaction Manager - Orchestrates voice command processing
 * Handles audio receiving, STT, command parsing, execution, and TTS responses
 */

import { VoiceConnection, VoiceConnectionStatus, EndBehaviorType } from '@discordjs/voice';
import type { Client } from 'discord.js';
import prism from 'prism-media';
import { createLogger } from '../logger';
import * as storage from '../storage';
import { promisify } from 'util';
import { exec } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as ttsPlayer from './ttsPlayer';

const execAsync = promisify(exec);
import type {
  VoiceInteractionConfig,
  VoiceInteractionState,
  VoiceInteractionSession,
  AudioChunk,
  ParsedVoiceCommand,
  VoiceCommandResult,
  IVoiceInteractionManager,
} from '@rainbot/types/voice-interaction';
import { SpeechRecognitionManager } from './speechRecognition';
import { TextToSpeechManager, generateResponseText } from './textToSpeech';
import { parseVoiceCommand, validateVoiceCommand } from './voiceCommandParser';
import { Mutex } from 'async-mutex';

const log = createLogger('VOICE_INTERACTION');

/** Minimal type for lazy-loaded voice manager (avoids circular dependency) */
interface VoiceManagerLazy {
  playSound: (
    guildId: string,
    query: string,
    userId: string,
    source: string,
    username: string,
    discriminator: string
  ) => Promise<{ tracks: Array<{ title?: string }> }>;
  skipTrack: (guildId: string, count: number) => Promise<void>;
  pausePlayback: (guildId: string) => Promise<void>;
  resumePlayback: (guildId: string) => Promise<void>;
  stopPlayback: (guildId: string) => Promise<void>;
  getQueue: (guildId: string) => { queue: unknown[] };
  getVoiceState?: (guildId: string) => { volume?: number } | undefined;
  setVolume: (guildId: string, volume: number) => Promise<void>;
  clearQueue: (guildId: string) => Promise<number>;
  /** For TTS ducking: current playback position in seconds */
  getPlaybackPositionSeconds?: (guildId: string) => number;
  /** For TTS ducking: resume music at position (seconds) */
  resumeAtPosition?: (guildId: string, positionSeconds: number) => Promise<void>;
}

/**
 * Default configuration for voice interactions
 */
const DEFAULT_CONFIG: VoiceInteractionConfig = {
  enabled: false,
  sttProvider: 'openai',
  ttsProvider: 'openai',
  language: 'en-US',
  maxAudioDuration: 10, // 10 seconds max
  minAudioDuration: 0.1, // 0.1 second min (Whisper's absolute minimum) :()
  confidenceThreshold: 0.6,
  recordAudio: false, // Default to opt-in recording
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
  private voiceManager: VoiceManagerLazy | null;
  private commandMutex: Mutex;
  private voiceAgentClients: Map<string, { sendAudio(chunk: Buffer): void; close(): void }>;
  private voiceAgentWarnedKeys: Set<string>;

  constructor(_client: Client, config?: Partial<VoiceInteractionConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.states = new Map();
    this.voiceManager = null;
    this.commandMutex = new Mutex();
    this.voiceAgentClients = new Map();
    this.voiceAgentWarnedKeys = new Set();

    // Initialize STT and TTS
    this.speechRecognition = new SpeechRecognitionManager(this.config);
    this.textToSpeech = new TextToSpeechManager(this.config);

    log.info('Voice Interaction Manager initialized');
  }

  /**
   * Lazy load voice manager to avoid circular dependency
   */
  private getVoiceManager(): VoiceManagerLazy {
    if (!this.voiceManager) {
      try {
        this.voiceManager = require('../voiceManager') as VoiceManagerLazy;
      } catch (_error) {
        this.voiceManager = require('../../dist/utils/voiceManager') as VoiceManagerLazy;
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
   * Subscribe to a user's audio stream and attach data/end/error handlers.
   * On stream end, processes the utterance then resubscribes so the next utterance is captured.
   */
  private subscribeToUserAudio(session: VoiceInteractionSession): void {
    const state = this.states.get(session.guildId);
    const connection = (session as any).connection as VoiceConnection | undefined;
    if (!state || !connection) return;

    const receiver = connection.receiver;
    const userId = session.userId;
    const guildId = session.guildId;

    const opusStream = receiver.subscribe(userId, {
      end: {
        behavior: EndBehaviorType.AfterSilence,
        duration: 3000, // 3 seconds of silence ends the stream
      },
    });

    // Discord sends raw Opus packets; decode to PCM for STT and Voice Agent
    const opusDecoder = new prism.opus.Decoder({
      rate: 48000,
      channels: 2,
      frameSize: 960,
    });
    opusStream.pipe(opusDecoder);

    log.debug(`Subscribed to audio from user ${userId} (Opus → PCM)`);

    let firstChunkReceived = false;
    let chunkSequence = 0;
    let lastLogTime = Date.now();
    let totalBytesReceived = 0;

    opusDecoder.on('data', (chunk: Buffer) => {
      if (!session.isListening) return;

      if (!firstChunkReceived) {
        log.info(`First audio chunk received from user ${userId} (${chunk.length} bytes)`);
        firstChunkReceived = true;
      }

      totalBytesReceived += chunk.length;

      const now = Date.now();
      if (now - lastLogTime > 500) {
        const durationSoFar = totalBytesReceived / 192000;
        log.debug(
          `Hearing audio from user ${userId} - ${session.audioBuffer.length} chunks, ${totalBytesReceived} bytes, ${durationSoFar.toFixed(2)}s`
        );
        lastLogTime = now;
      }

      if (chunk.length <= 10) {
        log.debug(`⏭️ Skipping silence packet: ${chunk.length} bytes`);
        return;
      }

      if (chunk.length < 100) {
        log.debug(`Very small audio chunk: ${chunk.length} bytes`);
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

    opusDecoder.on('end', async () => {
      log.info(
        `Silence detected for user ${userId} - processing ${session.audioBuffer.length} chunks`
      );

      if (session.audioBuffer.length > 0) {
        await this.processCompleteAudio(session);
      }

      // Resubscribe for the next utterance if session is still active
      const currentState = this.states.get(session.guildId);
      const conn = (session as any).connection as VoiceConnection | undefined;
      if (
        currentState?.sessions.get(session.userId) === session &&
        session.isListening &&
        conn?.state.status !== VoiceConnectionStatus.Destroyed
      ) {
        this.subscribeToUserAudio(session);
      }
    });

    opusDecoder.on('error', (error) => {
      const errorMsg = error.message;
      log.error(`Audio stream error for user ${userId}: ${errorMsg}`);

      if (errorMsg.includes('DecryptionFailed') || errorMsg.includes('Failed to decrypt')) {
        log.error('Voice decryption error detected!');
        log.error('This usually means Discord voice encryption is not properly configured.');
        log.error('Try disconnecting and reconnecting the bot to the voice channel.');

        setTimeout(() => {
          const currentSession = state?.sessions.get(userId);
          const conn = (session as any).connection as VoiceConnection | undefined;
          if (
            currentSession &&
            currentSession.isListening &&
            conn?.state.status !== VoiceConnectionStatus.Destroyed
          ) {
            log.info(`Attempting to resubscribe to user ${userId} audio after error...`);
            this.subscribeToUserAudio(session);
          }
        }, 1000);
      }
    });
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

    const session: VoiceInteractionSession = {
      userId,
      guildId,
      channelId: connection.joinConfig.channelId!,
      username: 'User',
      isListening: true,
      audioBuffer: [],
      lastCommandTime: Date.now(),
      consecutiveFailures: 0,
    };

    state.sessions.set(userId, session);
    (session as any).connection = connection;

    this.subscribeToUserAudio(session);
  }

  /**
   * Save recorded audio to soundboard storage for debugging
   */
  private async saveRecordedAudio(
    userId: string,
    _guildId: string,
    audioBuffers: Buffer[]
  ): Promise<void> {
    let tempRawFile: string | null = null;
    let tempWavFile: string | null = null;

    try {
      // Concatenate all audio chunks
      const audioBuffer = Buffer.concat(audioBuffers);
      const timestamp = Date.now();

      // Create temporary files for conversion
      const tempDir = os.tmpdir();
      tempRawFile = path.join(tempDir, `recording-${userId}-${timestamp}.raw`);
      tempWavFile = path.join(tempDir, `recording-${userId}-${timestamp}.wav`);

      // Write raw PCM to temporary file
      fs.writeFileSync(tempRawFile, audioBuffer);

      // Convert to WAV using FFmpeg
      // Discord audio receiver outputs: s16le (signed 16-bit little-endian), 48kHz, mono
      const ffmpegCmd = `ffmpeg -f s16le -ar 48000 -ac 1 -i "${tempRawFile}" -y "${tempWavFile}"`;
      await execAsync(ffmpegCmd);

      // Read the WAV file
      const wavBuffer = fs.readFileSync(tempWavFile);

      // Upload WAV to soundboard storage under records/ subdirectory
      const filename = `records/${userId}-${timestamp}.wav`;

      // Create an async iterable from the buffer
      async function* bufferToAsyncIterable(buf: Buffer): AsyncIterable<Buffer> {
        yield buf;
      }

      await storage.uploadSound(bufferToAsyncIterable(wavBuffer), filename);

      log.info(`Recording saved to soundboard: ${filename} (${wavBuffer.length} bytes WAV)`);
      log.info(`   Original PCM: ${audioBuffer.length} bytes`);
      log.info(`   Play with: /play ${filename}`);
    } catch (error) {
      log.error(`Failed to save audio recording: ${(error as Error).message}`);
    } finally {
      // Clean up temporary files
      if (tempRawFile && fs.existsSync(tempRawFile)) {
        fs.unlinkSync(tempRawFile);
      }
      if (tempWavFile && fs.existsSync(tempWavFile)) {
        fs.unlinkSync(tempWavFile);
      }
    }
  }

  /**
   * Stop listening to a user
   */
  async stopListening(userId: string, guildId: string): Promise<void> {
    log.info(`Stopping listening to user ${userId} in guild ${guildId}`);

    const key = `${guildId}:${userId}`;
    const voiceAgent = this.voiceAgentClients.get(key);
    if (voiceAgent) {
      voiceAgent.close();
      this.voiceAgentClients.delete(key);
      this.voiceAgentWarnedKeys.delete(key);
    }

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

    // Voice Agent path: stream audio to xAI realtime when conversation mode is on
    const conversationMode =
      this.config.getConversationMode &&
      (await this.config.getConversationMode(chunk.guildId, chunk.userId));
    if (conversationMode && this.config.createVoiceAgentClient) {
      const key = `${chunk.guildId}:${chunk.userId}`;
      let client = this.voiceAgentClients.get(key);
      if (!client) {
        const newClient = this.config.createVoiceAgentClient({
          ...session,
          connection: (session as { connection?: unknown }).connection,
        });
        if (newClient) {
          this.voiceAgentClients.set(key, newClient);
          client = newClient;
          log.info(
            `Voice Agent client created for ${chunk.guildId}:${chunk.userId} (realtime path)`
          );
        } else {
          if (!this.voiceAgentWarnedKeys.has(key)) {
            this.voiceAgentWarnedKeys.add(key);
            log.warn(
              `Conversation mode on but Voice Agent client is null — realtime path unavailable. Set REDIS_URL and GROK_API_KEY on Pranjeet; ensure you are in a VC with the voice bot. Audio will not be sent to STT.`
            );
          }
          // Realtime path intended: do not fall back to STT when conversation mode is on
          return;
        }
      }
      if (client) {
        client.sendAudio(chunk.buffer);
        return;
      }
    }

    // Add chunk to buffer (STT path — only when conversation mode is off)
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
      log.warn(
        `Audio too short (${totalDuration.toFixed(3)}s / ${totalBytes} bytes) - Discord VAD may not be detecting your voice. Check Discord input sensitivity!`
      );
      return;
    }

    log.info(
      `Processing ${audioBuffers.length} audio chunks (${totalDuration.toFixed(3)}s / ${totalBytes} bytes) from user ${session.userId}`
    );

    // Optionally record audio for debugging
    if (this.config.recordAudio) {
      this.saveRecordedAudio(session.userId, session.guildId, audioBuffers);
    }

    try {
      // Convert audio to text
      log.info('Transcribing audio...');
      const result = await this.speechRecognition.processDiscordAudio(audioBuffers);

      if (!result.text || result.text.trim().length === 0) {
        log.warn('No speech detected in audio');
        return;
      }

      log.info(`Transcribed: "${result.text}" (confidence: ${result.confidence.toFixed(2)})`);

      // Trigger word: only process if transcript starts with trigger (when configured)
      let textToParse = result.text.trim();
      const triggerWord = this.config.triggerWord?.trim();
      if (triggerWord && triggerWord.length > 0) {
        const tw = triggerWord.toLowerCase();
        const t = textToParse.toLowerCase();
        if (!t.startsWith(tw)) {
          log.debug(`Ignored utterance (no trigger match): "${result.text}"`);
          return;
        }
        textToParse = textToParse.slice(tw.length).trim();
        if (textToParse.length === 0) {
          log.debug('Ignored: transcript was only trigger');
          return;
        }
      }

      // Parse command
      log.debug(`Parsing voice command: "${textToParse}"`);
      const command = parseVoiceCommand(textToParse);

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
      await this.sendVoiceResponse(session.guildId, "I'm having trouble understanding you.");
      // Do not call stopListening; resubscribe happens in stream end handler
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

      log.info(`Executing voice command: ${command.type} (query: ${command.query || 'N/A'})`);

      // Use custom command handler if provided
      if (this.config.commandHandler) {
        const result = await this.config.commandHandler(session, command);
        if (result) {
          // Update statistics based on custom handler result
          if (result.success) {
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

          log.info(
            `Custom command handler ${result.success ? 'succeeded' : 'failed'} in ${latency}ms`
          );

          // Send voice response if provided
          if (result.response) {
            await this.sendVoiceResponse(session.guildId, result.response);
          }

          return result;
        }
      }

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
            if (command.parameter === undefined) {
              throw new Error('Volume not specified');
            }

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
      log.info(`Preparing TTS response: "${text}"`);

      // Generate TTS audio file
      log.debug('Synthesizing speech...');
      const audioFile = await this.textToSpeech.synthesizeToFile(text);
      log.debug(`TTS file generated: ${audioFile}`);

      // Get the connection from any active session in this guild
      const state = this.states.get(guildId);
      if (!state) {
        log.warn(`No voice interaction state for guild ${guildId}`);
        return;
      }

      // Find a connection from any active session
      let connection: VoiceConnection | null = null;
      for (const [, session] of state.sessions) {
        if ((session as any).connection) {
          connection = (session as any).connection;
          break;
        }
      }

      if (!connection) {
        log.warn(`No voice connection found for TTS playback in guild ${guildId}`);
        return;
      }

      // Play via dedicated TTS player; use ducking (pause → TTS → resume at position) when music is playing and VM supports it
      log.debug(`▶️ Playing TTS audio in voice channel...`);
      const vm = this.getVoiceManager();
      const ttsOptions =
        typeof vm.getPlaybackPositionSeconds === 'function' &&
        typeof vm.resumeAtPosition === 'function'
          ? {
              onBeforeTTS: () => Promise.resolve(vm.getPlaybackPositionSeconds!(guildId) ?? 0),
              onAfterTTS: (positionSeconds: number) =>
                vm.resumeAtPosition!(guildId, positionSeconds),
            }
          : undefined;
      await ttsPlayer.playTTSAudio(guildId, connection, audioFile, ttsOptions);
      log.info('TTS playback completed');

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
