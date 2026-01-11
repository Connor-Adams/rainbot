/**
 * Voice Interaction Manager - Orchestrates voice command processing
 * Handles audio receiving, STT, command parsing, execution, and TTS responses
 */

import { VoiceConnection, EndBehaviorType } from '@discordjs/voice';
import type { Client } from 'discord.js';
import { createLogger } from '../logger.ts';
import * as storage from '../storage.ts';
import { promisify } from 'util';
import { exec } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

const execAsync = promisify(exec);

import type {
  VoiceInteractionConfig,
  VoiceInteractionState,
  VoiceInteractionSession as BaseVoiceInteractionSession,
  AudioChunk,
  ParsedVoiceCommand,
  VoiceCommandResult,
  IVoiceInteractionManager,
} from '../../types/voice-interaction.ts';
import { SpeechRecognitionManager } from './speechRecognition.ts';
import { TextToSpeechManager, generateResponseText } from './textToSpeech.ts';
import { parseVoiceCommand, validateVoiceCommand } from './voiceCommandParser.ts';
import { Mutex } from 'async-mutex';
import { Buffer } from 'node:buffer';

const log = createLogger('VOICE_INTERACTION');

interface IVoiceManager {
  playSound(
    guildId: string,
    query: string,
    userId: string,
    type: string,
    username: string,
    extra?: string
  ): Promise<{ tracks: { title?: string }[] }>;
  skipTrack(guildId: string, count?: number): Promise<void>;
  pausePlayback(guildId: string): Promise<void>;
  resumePlayback(guildId: string): Promise<void>;
  stopPlayback(guildId: string): Promise<void>;
  getQueue(guildId: string): { queue: unknown[] };
  setVolume?(guildId: string, volume: number): Promise<void>;
  clearQueue?(guildId: string): Promise<void>;
  getVoiceState?(guildId: string): { volume: number };
}

interface VoiceInteractionSession extends BaseVoiceInteractionSession {
  connection?: VoiceConnection;
}

const DEFAULT_CONFIG: VoiceInteractionConfig = {
  enabled: false,
  sttProvider: 'openai',
  ttsProvider: 'openai',
  language: 'en-US',
  maxAudioDuration: 10,
  minAudioDuration: 0.1,
  confidenceThreshold: 0.6,
  recordAudio: true,
  rateLimit: {
    maxCommandsPerMinute: 10,
    maxCommandsPerHour: 60,
  },
};

export class VoiceInteractionManager implements IVoiceInteractionManager {
  private config: VoiceInteractionConfig;
  private states: Map<string, VoiceInteractionState>;
  private speechRecognition: SpeechRecognitionManager;
  private textToSpeech: TextToSpeechManager;
  private voiceManager: IVoiceManager | null = null;
  private commandMutex: Mutex;

  constructor(_client: Client, config?: Partial<VoiceInteractionConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.states = new Map();
    this.commandMutex = new Mutex();
    this.speechRecognition = new SpeechRecognitionManager(this.config);
    this.textToSpeech = new TextToSpeechManager(this.config);
    log.info('Voice Interaction Manager initialized');
  }

  private getVoiceManager(): IVoiceManager {
    if (!this.voiceManager) {
      this.voiceManager = require('../voiceManager') as IVoiceManager;
    }
    return this.voiceManager;
  }

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
      this.states.get(guildId)!.enabled = true;
    }
    await this.textToSpeech.preloadCommonResponses();
    log.info(`Voice interactions enabled for guild ${guildId}`);
  }

  async disableForGuild(guildId: string): Promise<void> {
    log.info(`Disabling voice interactions for guild ${guildId}`);
    const state = this.states.get(guildId);
    if (state) {
      state.enabled = false;
      for (const [userId] of state.sessions) {
        await this.stopListening(userId, guildId);
      }
    }
    log.info(`Voice interactions disabled for guild ${guildId}`);
  }

  isEnabledForGuild(guildId: string): boolean {
    return this.states.get(guildId)?.enabled ?? false;
  }

  async startListening(
    userId: string,
    guildId: string,
    connection: VoiceConnection
  ): Promise<void> {
    if (!this.isEnabledForGuild(guildId)) return;

    const state = this.states.get(guildId);
    if (!state) throw new Error(`No voice interaction state for guild ${guildId}`);

    const session: VoiceInteractionSession = {
      userId,
      guildId,
      channelId: connection.joinConfig.channelId!,
      username: 'User',
      isListening: true,
      audioBuffer: [],
      lastCommandTime: Date.now(),
      consecutiveFailures: 0,
      connection,
    };

    state.sessions.set(userId, session);

    const receiver = connection.receiver;
    const audioStream = receiver.subscribe(userId, {
      end: { behavior: EndBehaviorType.AfterSilence, duration: 3000 },
    });

    let firstChunkReceived = false;
    let lastLogTime = Date.now();
    let totalBytesReceived = 0;

    audioStream.on('data', (chunk: Buffer) => {
      if (!session.isListening) return;
      if (!firstChunkReceived) {
        log.info(`🎙️ First audio chunk received from user ${userId} (${chunk.length} bytes)`);
        firstChunkReceived = true;
      }

      totalBytesReceived += chunk.length;
      const now = Date.now();
      if (now - lastLogTime > 500) {
        const durationSoFar = totalBytesReceived / 192000;
        log.debug(
          `🎤 Hearing audio from user ${userId} - ${session.audioBuffer.length} chunks, ${totalBytesReceived} bytes, ${durationSoFar.toFixed(2)}s`
        );
        lastLogTime = now;
      }

      if (chunk.length <= 10) return;
      if (chunk.length < 100) log.warn(`⚠️ Very small audio chunk: ${chunk.length} bytes`);

      session.audioBuffer.push(chunk);

      if (session.audioBuffer.length * 0.02 > this.config.maxAudioDuration) {
        this.processCompleteAudio(session).catch((err) =>
          log.error(`Error processing audio: ${(err as Error).message}`)
        );
      }
    });

    audioStream.on('end', async () => {
      if (session.audioBuffer.length > 0) {
        await this.processCompleteAudio(session);
      }
    });

    audioStream.on('error', (error) => {
      log.error(`Audio stream error for user ${userId}: ${error.message}`);
    });
  }

  async stopListening(userId: string, guildId: string): Promise<void> {
    const state = this.states.get(guildId);
    if (!state) return;

    const session = state.sessions.get(userId);
    if (session) {
      session.isListening = false;
      session.audioBuffer = [];
      state.sessions.delete(userId);
    }
  }

  private async saveRecordedAudio(
    userId: string,
    _guildId: string,
    audioBuffers: Uint8Array[]
  ): Promise<void> {
    let tempRawFile: string | null = null;
    let tempWavFile: string | null = null;
    try {
      const audioBuffer = (Buffer as any).concat(audioBuffers);
      const timestamp = Date.now();
      const tempDir = os.tmpdir();
      tempRawFile = path.join(tempDir, `recording-${userId}-${timestamp}.raw`);
      tempWavFile = path.join(tempDir, `recording-${userId}-${timestamp}.wav`);
      fs.writeFileSync(tempRawFile, audioBuffer);
      const ffmpegCmd = `ffmpeg -f s16le -ar 48000 -ac 1 -i "${tempRawFile}" -y "${tempWavFile}"`;
      await execAsync(ffmpegCmd);
      const wavBuffer = fs.readFileSync(tempWavFile);
      const filename = `records/${userId}-${timestamp}.wav`;
      async function* bufferToAsyncIterable(buf: Uint8Array): AsyncIterable<Uint8Array> {
        yield buf;
      }
      await storage.uploadSound(bufferToAsyncIterable(wavBuffer), filename);
      log.info(`💾 Recording saved to soundboard: ${filename} (${wavBuffer.length} bytes WAV)`);
    } catch (error) {
      log.error(`Failed to save audio recording: ${(error as Error).message}`);
    } finally {
      if (tempRawFile && fs.existsSync(tempRawFile)) fs.unlinkSync(tempRawFile);
      if (tempWavFile && fs.existsSync(tempWavFile)) fs.unlinkSync(tempWavFile);
    }
  }

  async processAudioChunk(chunk: AudioChunk): Promise<void> {
    const state = this.states.get(chunk.guildId);
    if (!state) return;
    const session = state.sessions.get(chunk.userId);
    if (!session?.isListening) return;

    session.audioBuffer.push(chunk.buffer);
    if (session.audioBuffer.length * 0.02 > this.config.maxAudioDuration) {
      await this.processCompleteAudio(session);
    }
  }

  private async processCompleteAudio(session: VoiceInteractionSession): Promise<void> {
    const audioBuffers = session.audioBuffer;
    session.audioBuffer = [];
    if (audioBuffers.length === 0) return;

    if (this.config.recordAudio) {
      this.saveRecordedAudio(session.userId, session.guildId, audioBuffers);
    }

    try {
      const result = await this.speechRecognition.processDiscordAudio(audioBuffers);
      if (!result.text || !result.text.trim()) return;
      const command = parseVoiceCommand(result.text);
      const validation = validateVoiceCommand(command, this.config.confidenceThreshold);
      if (!validation.valid) {
        await this.sendVoiceResponse(session.guildId, "I'm sorry, I didn't understand that.");
        return;
      }
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

  private async executeVoiceCommand(
    session: VoiceInteractionSession,
    command: ParsedVoiceCommand
  ): Promise<VoiceCommandResult> {
    const startTime = Date.now();
    const state = this.states.get(session.guildId);
    if (!state) throw new Error(`No state for guild ${session.guildId}`);

    const timeSinceLastCommand = Date.now() - session.lastCommandTime;
    if (timeSinceLastCommand < 2000) {
      return { success: false, command, response: 'Please wait a moment before the next command.' };
    }

    session.lastCommandTime = Date.now();
    state.statistics.totalCommands++;
    const release = await this.commandMutex.acquire();

    try {
      state.isProcessingCommand = true;
      const vm = this.getVoiceManager();
      let success = false;
      let responseText = '';

      switch (command.type) {
        case 'play':
          try {
            const res = await vm.playSound(
              session.guildId,
              command.query!,
              session.userId,
              'voice',
              session.username
            );
            success = true;
            responseText = generateResponseText('play', true, res.tracks[0]?.title);
          } catch {
            responseText = generateResponseText('play', false);
          }
          break;
        case 'skip':
          try {
            await vm.skipTrack(session.guildId, (command.parameter as number) || 1);
            success = true;
            responseText = generateResponseText('skip', true);
          } catch {
            responseText = generateResponseText('skip', false);
          }
          break;
        case 'pause':
          try {
            await vm.pausePlayback(session.guildId);
            success = true;
            responseText = generateResponseText('pause', true);
          } catch {
            responseText = generateResponseText('pause', false);
          }
          break;
        case 'resume':
          try {
            await vm.resumePlayback(session.guildId);
            success = true;
            responseText = generateResponseText('resume', true);
          } catch {
            responseText = generateResponseText('resume', false);
          }
          break;
        case 'stop':
          try {
            await vm.stopPlayback(session.guildId);
            success = true;
            responseText = generateResponseText('stop', true);
          } catch {
            responseText = generateResponseText('stop', false);
          }
          break;
        case 'queue':
          try {
            const queueInfo = vm.getQueue(session.guildId);
            success = true;
            responseText = queueInfo.queue.length
              ? `There are ${queueInfo.queue.length} tracks in the queue`
              : 'The queue is empty';
          } catch {
            responseText = generateResponseText('queue', false);
          }
          break;
        case 'volume':
          try {
            let volume = command.parameter as number;
            const currentVolume = vm.getVoiceState?.(session.guildId)?.volume || 50;
            if (volume < 0 || volume > 100)
              volume = Math.max(0, Math.min(100, currentVolume + volume));
            await vm.setVolume?.(session.guildId, volume);
            success = true;
            responseText = generateResponseText('volume', true, `Volume set to ${volume}`);
          } catch {
            responseText = generateResponseText('volume', false);
          }
          break;
        case 'clear':
          try {
            await vm.clearQueue?.(session.guildId);
            success = true;
            responseText = generateResponseText('clear', true);
          } catch {
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

      if (success) {
        state.statistics.successfulCommands++;
        session.consecutiveFailures = 0;
      } else {
        state.statistics.failedCommands++;
        session.consecutiveFailures++;
      }

      const latency = Date.now() - startTime;
      const totalCommands = state.statistics.totalCommands;
      state.statistics.averageLatency =
        (state.statistics.averageLatency * (totalCommands - 1) + latency) / totalCommands;

      if (responseText.length > 0) {
        await this.sendVoiceResponse(session.guildId, responseText);
      }

      return { success, command, response: responseText };
    } finally {
      state.isProcessingCommand = false;
      release();
    }
  }

  private async sendVoiceResponse(guildId: string, text: string): Promise<void> {
    if (!text.trim()) return;
    try {
      await this.textToSpeech.speak(guildId, text);
    } catch (error) {
      log.error(`Failed to send voice response in guild ${guildId}: ${(error as Error).message}`);
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
    const state = this.states.get(guildId);
    if (state) {
      // Stop listening, etc.
      this.states.delete(guildId);
      log.info(`Cleaned up voice interactions for guild ${guildId}`);
    }
  }

  /**
   * Get all guild IDs with voice interactions enabled
   */
  getAllGuildIds(): string[] {
    return Array.from(this.states.keys());
  }
}
