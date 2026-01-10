/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Text-to-Speech Module - Convert text responses to audio
 * Supports multiple TTS providers: Google Cloud TTS, AWS Polly, Azure
 */ import { createLogger } from '../logger.ts';
import type {
  TextToSpeechRequest,
  TextToSpeechResult,
  VoiceInteractionConfig,
} from '../../types/voice-interaction.ts';
import { writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const log = createLogger('TEXT_TO_SPEECH');

/**
 * Abstract interface for TTS providers
 */
interface TTSProvider {
  synthesize(request: TextToSpeechRequest): Promise<TextToSpeechResult>;
}

/**
 * Google Cloud Text-to-Speech provider
 * Requires @google-cloud/text-to-speech package
 */
class GoogleTTSProvider implements TTSProvider {
  private client: any;
  private defaultVoice: string;

  constructor(apiKey?: string, voiceName: string = 'en-US-Neural2-J') {
    try {
      const textToSpeech = require('@google-cloud/text-to-speech');
      this.client = new textToSpeech.TextToSpeechClient(apiKey ? { apiKey } : undefined);
      this.defaultVoice = voiceName;
      log.info('Google Cloud TTS client initialized');
    } catch (error) {
      log.error(`Failed to initialize Google TTS client: ${(error as Error).message}`);
      throw new Error(
        'Google Cloud TTS package not installed. Run: npm install @google-cloud/text-to-speech'
      );
    }
  }

  async synthesize(request: TextToSpeechRequest): Promise<TextToSpeechResult> {
    try {
      const ttsRequest = {
        input: { text: request.text },
        voice: {
          languageCode: request.languageCode || 'en-US',
          name: request.voiceName || this.defaultVoice,
        },
        audioConfig: {
          audioEncoding: 'LINEAR16' as const,
          sampleRateHertz: 48000,
          pitch: request.pitch || 0,
          speakingRate: request.speakingRate || 1.0,
        },
      };

      log.debug(`Synthesizing speech: "${request.text.substring(0, 50)}..."`);
      const [response] = await this.client.synthesizeSpeech(ttsRequest);

      if (!response.audioContent) {
        throw new Error('No audio content in TTS response');
      }

      const audioBuffer = (Buffer as any).from(response.audioContent);

      return {
        audioBuffer,
        format: 'pcm',
        sampleRate: 48000,
      };
    } catch (error) {
      log.error(`Google TTS error: ${(error as Error).message}`);
      throw error;
    }
  }
}

/**
 * OpenAI Text-to-Speech provider
 * Requires openai package
 */
class OpenAITTSProvider implements TTSProvider {
  private client: any;
  private defaultVoice: string;

  constructor(apiKey: string, voiceName: string = 'alloy') {
    try {
      const { OpenAI } = require('openai');
      this.client = new OpenAI({ apiKey });
      this.defaultVoice = voiceName;
      log.info('OpenAI TTS client initialized');
    } catch (error) {
      log.error(`Failed to initialize OpenAI TTS client: ${(error as Error).message}`);
      throw new Error('OpenAI package not installed. Run: npm install openai');
    }
  }

  async synthesize(request: TextToSpeechRequest): Promise<TextToSpeechResult> {
    try {
      // Validate voice name
      const validVoices = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];
      const voiceName = request.voiceName || this.defaultVoice;

      if (!validVoices.includes(voiceName)) {
        log.warn(`Invalid voice name "${voiceName}", falling back to "${this.defaultVoice}"`);
      }

      const voice = (validVoices.includes(voiceName) ? voiceName : this.defaultVoice) as
        | 'alloy'
        | 'echo'
        | 'fable'
        | 'onyx'
        | 'nova'
        | 'shimmer';

      log.debug(`Synthesizing speech with OpenAI TTS: "${request.text.substring(0, 50)}..."`);

      const response = await this.client.audio.speech.create({
        model: 'tts-1',
        voice: voice,
        input: request.text,
        response_format: 'pcm',
        speed: request.speakingRate || 1.0,
      });

      // OpenAI returns PCM audio at 24kHz, we need to convert to 48kHz for Discord
      const pcm24k = (Buffer as any).from(await response.arrayBuffer());
      const pcm48k = this.resample24to48(pcm24k);

      return {
        audioBuffer: pcm48k,
        format: 'pcm',
        sampleRate: 48000,
      };
    } catch (error) {
      log.error(`OpenAI TTS error: ${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * Resample 24kHz PCM to 48kHz PCM (simple 2x upsampling)
   * Input: 24000 samples/sec, Output: 48000 samples/sec
   * Each input sample is duplicated to create two output samples
   */
  private resample24to48(pcm24k: Uint8Array): Uint8Array {
    const samples24k = pcm24k.length / 2; // 16-bit = 2 bytes per sample
    const pcm48k = (Buffer as any).alloc(samples24k * 4); // 2x samples, 2 bytes each = 4x buffer

    for (let i = 0; i < samples24k; i++) {
      const sample = (pcm24k as any).readInt16LE(i * 2);
      // Write each sample twice for 2x upsampling
      pcm48k.writeInt16LE(sample, i * 4);
      pcm48k.writeInt16LE(sample, i * 4 + 2);
    }

    return pcm48k;
  }
}

/**
 * Mock TTS provider for testing/development
 * Returns silence
 */
class MockTTSProvider implements TTSProvider {
  async synthesize(request: TextToSpeechRequest): Promise<TextToSpeechResult> {
    log.warn(`Mock TTS: "${request.text}"`);

    // Generate 1 second of silence (48000 Hz, 16-bit PCM)
    const silenceBuffer = (Buffer as any).alloc(48000 * 2);

    return {
      audioBuffer: silenceBuffer,
      format: 'pcm',
      sampleRate: 48000,
      duration: 1,
    };
  }
}

/**
 * Text-to-speech manager with caching
 */
export class TextToSpeechManager {
  private provider: TTSProvider;
  private config: VoiceInteractionConfig;
  private cache: Map<string, TextToSpeechResult>;
  private readonly MAX_CACHE_SIZE = 50;

  constructor(config: VoiceInteractionConfig) {
    this.config = config;
    this.provider = this.createProvider(config);
    this.cache = new Map();
  }

  private createProvider(config: VoiceInteractionConfig): TTSProvider {
    switch (config.ttsProvider) {
      case 'google':
        try {
          return new GoogleTTSProvider(config.ttsApiKey, config.voiceName);
        } catch (error) {
          log.error(`Failed to create Google TTS provider: ${(error as Error).message}`);
          log.warn('Falling back to mock TTS provider');
          return new MockTTSProvider();
        }

      case 'openai':
        try {
          if (!config.ttsApiKey) {
            throw new Error('OpenAI API key required');
          }
          return new OpenAITTSProvider(config.ttsApiKey, config.voiceName);
        } catch (error) {
          log.error(`Failed to create OpenAI TTS provider: ${(error as Error).message}`);
          log.warn('Falling back to mock TTS provider');
          return new MockTTSProvider();
        }

      case 'azure':
      case 'aws':
      case 'polly':
        log.warn(`TTS provider ${config.ttsProvider} not yet implemented`);
        log.warn('Falling back to mock TTS provider');
        return new MockTTSProvider();

      default:
        log.warn(`Unknown TTS provider: ${config.ttsProvider}, using mock`);
        return new MockTTSProvider();
    }
  }

  /**
   * Convert text to speech audio
   */
  async synthesize(
    text: string,
    options?: Partial<TextToSpeechRequest>
  ): Promise<TextToSpeechResult> {
    const startTime = Date.now();

    // Generate cache key
    const cacheKey = this.getCacheKey(text, options);

    // Check cache
    const cached = this.cache.get(cacheKey);
    if (cached) {
      log.debug(`\ud83d\udccb TTS cache hit for: "${text.substring(0, 30)}..."`);
      return cached;
    }

    log.debug(
      `\ud83c\udfb5 Generating TTS for: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`
    );

    try {
      const request: TextToSpeechRequest = {
        text,
        voiceName: options?.voiceName || this.config.voiceName,
        languageCode: options?.languageCode || this.config.language,
        pitch: options?.pitch,
        speakingRate: options?.speakingRate,
      };

      const result = await this.provider.synthesize(request);

      const latency = Date.now() - startTime;
      log.info(
        `\u2705 TTS completed in ${latency}ms: "${text.substring(0, 50)}..." (${result.audioBuffer.length} bytes)`
      );

      // Cache the result
      this.addToCache(cacheKey, result);

      return result;
    } catch (error) {
      const latency = Date.now() - startTime;
      log.error(`TTS failed after ${latency}ms: ${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * Generate a temporary audio file for playback
   */
  async synthesizeToFile(text: string, options?: Partial<TextToSpeechRequest>): Promise<string> {
    log.debug(
      `\ud83c\udf99\ufe0f Synthesizing to file: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`
    );
    const result = await this.synthesize(text, options);

    // Create temporary file
    const tempFile = join(tmpdir(), `tts-${Date.now()}.pcm`);
    writeFileSync(tempFile, result.audioBuffer);

    log.debug(
      `\ud83d\udcbe Created TTS audio file: ${tempFile} (${result.audioBuffer.length} bytes)`
    );

    return tempFile;
  }

  /**
   * Cleanup temporary TTS files
   */
  cleanupFile(filePath: string): void {
    try {
      unlinkSync(filePath);
      log.debug(`Cleaned up TTS file: ${filePath}`);
    } catch (error) {
      log.warn(`Failed to cleanup TTS file ${filePath}: ${(error as Error).message}`);
    }
  }

  /**
   * Generate cache key for a TTS request
   */
  private getCacheKey(text: string, options?: Partial<TextToSpeechRequest>): string {
    const normalized = text.toLowerCase().trim();
    const voice = options?.voiceName || this.config.voiceName || 'default';
    const lang = options?.languageCode || this.config.language;
    return `${lang}:${voice}:${normalized}`;
  }

  /**
   * Add result to cache with LRU eviction
   */
  private addToCache(key: string, result: TextToSpeechResult): void {
    // Evict oldest entry if cache is full
    if (this.cache.size >= this.MAX_CACHE_SIZE) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }

    this.cache.set(key, result);
  }

  /**
   * Clear the TTS cache
   */
  clearCache(): void {
    this.cache.clear();
    log.debug('TTS cache cleared');
  }

  /**
   * Speak text in a guild (synthesize and play audio)
   */
  async speak(guildId: string, text: string): Promise<void> {
    try {
      await this.synthesize(text);
      log.info(`TTS synthesized for guild ${guildId}: ${text}`);
      // TODO: Play the audio buffer via voice manager
    } catch (error) {
      log.error(`TTS speak failed for guild ${guildId}: ${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * Get common voice responses (pre-generate for common phrases)
   */
  async preloadCommonResponses(): Promise<void> {
    const commonResponses = [
      'Playing now',
      'Skipped',
      'Paused',
      'Resumed',
      'Stopped',
      "I couldn't find that song",
      'Added to queue',
      "I'm sorry, I didn't understand that",
      'Queue is empty',
      'Volume changed',
    ];

    log.info('Preloading common TTS responses...');

    await Promise.all(
      commonResponses.map((text) =>
        this.synthesize(text).catch((error) => {
          log.warn(`Failed to preload response "${text}": ${error.message}`);
        })
      )
    );

    log.info(`Preloaded ${this.cache.size} TTS responses`);
  }
}

/**
 * Create a text-to-speech manager instance
 */
export function createTextToSpeech(config: VoiceInteractionConfig): TextToSpeechManager {
  return new TextToSpeechManager(config);
}

/**
 * Helper function to generate response text for common commands
 */
export function generateResponseText(
  commandType: string,
  success: boolean,
  details?: string
): string {
  if (!success) {
    const errorMessages: Record<string, string> = {
      play: "I couldn't find that song. Try again with the artist name.",
      skip: 'Nothing to skip.',
      pause: 'Already paused.',
      resume: 'Already playing.',
      stop: 'Nothing to stop.',
      queue: 'Queue is empty.',
      volume: 'Volume must be between 0 and 100.',
      unknown: "I'm sorry, I didn't understand that. Say 'help' for available commands.",
    };

    return errorMessages[commandType] || "I'm sorry, something went wrong.";
  }

  const successMessages: Record<string, string> = {
    play: details ? `Playing ${details}` : 'Playing now',
    skip: 'Skipped',
    pause: 'Paused',
    resume: 'Resumed',
    stop: 'Stopped',
    queue: details || 'Queue is empty',
    volume: details || 'Volume changed',
    clear: 'Queue cleared',
    help: "I can play music, skip songs, pause, resume, stop, show the queue, and change volume. Just tell me what you'd like.",
  };

  return successMessages[commandType] || 'Done';
}
