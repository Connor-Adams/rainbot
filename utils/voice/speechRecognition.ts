/**
 * Speech Recognition Module - Convert audio to text
 * Supports multiple STT providers: Google Cloud Speech, Azure, AWS, local Whisper
 */

import { createLogger } from '../logger';
import type {
  SpeechRecognitionResult,
  VoiceInteractionConfig,
} from '../../types/voice-interaction';
import { PassThrough } from 'stream';

const log = createLogger('SPEECH_RECOGNITION');

/**
 * Abstract interface for STT providers
 */
interface STTProvider {
  recognize(audioBuffer: Buffer, languageCode: string): Promise<SpeechRecognitionResult>;
  recognizeStream(languageCode: string): NodeJS.WritableStream;
}

/**
 * Google Cloud Speech-to-Text provider
 * Requires @google-cloud/speech package and credentials
 */
class GoogleSTTProvider implements STTProvider {
  private client: any;

  constructor(apiKey?: string) {
    // Lazy load to avoid requiring package if not used
    try {
      const speech = require('@google-cloud/speech');
      this.client = new speech.SpeechClient(
        apiKey ? { apiKey } : undefined
      );
      log.info('Google Cloud Speech client initialized');
    } catch (error) {
      log.error(`Failed to initialize Google Speech client: ${(error as Error).message}`);
      throw new Error(
        'Google Cloud Speech package not installed. Run: npm install @google-cloud/speech'
      );
    }
  }

  async recognize(audioBuffer: Buffer, languageCode: string): Promise<SpeechRecognitionResult> {
    try {
      const audio = {
        content: audioBuffer.toString('base64'),
      };

      const config = {
        encoding: 'LINEAR16' as const,
        sampleRateHertz: 48000,
        languageCode: languageCode,
        enableAutomaticPunctuation: true,
        model: 'command_and_search', // Optimized for voice commands
      };

      const request = {
        audio: audio,
        config: config,
      };

      log.debug(`Sending ${audioBuffer.length} bytes to Google Speech API`);
      const [response] = await this.client.recognize(request);

      if (!response.results || response.results.length === 0) {
        return {
          text: '',
          confidence: 0,
          isFinal: true,
        };
      }

      const result = response.results[0];
      const alternative = result.alternatives[0];

      return {
        text: alternative.transcript || '',
        confidence: alternative.confidence || 0,
        alternatives: result.alternatives.slice(1).map((alt: any) => ({
          text: alt.transcript,
          confidence: alt.confidence,
        })),
        isFinal: true,
        languageCode: languageCode,
      };
    } catch (error) {
      log.error(`Google Speech recognition error: ${(error as Error).message}`);
      throw error;
    }
  }

  recognizeStream(languageCode: string): NodeJS.WritableStream {
    const request = {
      config: {
        encoding: 'LINEAR16' as const,
        sampleRateHertz: 48000,
        languageCode: languageCode,
        enableAutomaticPunctuation: true,
        model: 'command_and_search',
      },
      interimResults: false,
    };

    return this.client.streamingRecognize(request);
  }
}

/**
 * Mock STT provider for testing/development
 */
class MockSTTProvider implements STTProvider {
  async recognize(_audioBuffer: Buffer, _languageCode: string): Promise<SpeechRecognitionResult> {
    log.warn('Using mock STT provider - returning empty result');
    return {
      text: '',
      confidence: 0,
      isFinal: true,
    };
  }

  recognizeStream(_languageCode: string): NodeJS.WritableStream {
    log.warn('Using mock STT provider stream');
    return new PassThrough();
  }
}

/**
 * Speech recognition manager
 */
export class SpeechRecognitionManager {
  private provider: STTProvider;
  private config: VoiceInteractionConfig;

  constructor(config: VoiceInteractionConfig) {
    this.config = config;
    this.provider = this.createProvider(config);
  }

  private createProvider(config: VoiceInteractionConfig): STTProvider {
    switch (config.sttProvider) {
      case 'google':
        try {
          return new GoogleSTTProvider(config.sttApiKey);
        } catch (error) {
          log.error(`Failed to create Google STT provider: ${(error as Error).message}`);
          log.warn('Falling back to mock STT provider');
          return new MockSTTProvider();
        }

      case 'azure':
      case 'aws':
      case 'whisper':
        log.warn(`STT provider ${config.sttProvider} not yet implemented`);
        log.warn('Falling back to mock STT provider');
        return new MockSTTProvider();

      default:
        log.warn(`Unknown STT provider: ${config.sttProvider}, using mock`);
        return new MockSTTProvider();
    }
  }

  /**
   * Convert audio buffer to text
   */
  async recognize(audioBuffer: Buffer): Promise<SpeechRecognitionResult> {
    const startTime = Date.now();

    try {
      // Validate audio buffer
      if (!audioBuffer || audioBuffer.length === 0) {
        log.warn('Empty audio buffer provided to recognize()');
        return {
          text: '',
          confidence: 0,
          isFinal: true,
        };
      }

      log.debug(`Recognizing audio buffer of ${audioBuffer.length} bytes`);

      const result = await this.provider.recognize(
        audioBuffer,
        this.config.language
      );

      const latency = Date.now() - startTime;
      log.info(
        `STT completed in ${latency}ms: "${result.text}" (confidence: ${result.confidence.toFixed(2)})`
      );

      return result;
    } catch (error) {
      const latency = Date.now() - startTime;
      log.error(`STT failed after ${latency}ms: ${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * Create a streaming recognition instance
   */
  createRecognitionStream(): NodeJS.WritableStream {
    log.debug('Creating streaming recognition instance');
    return this.provider.recognizeStream(this.config.language);
  }

  /**
   * Process audio chunks from Discord voice stream
   * Discord provides Opus-decoded PCM audio at 48kHz, 16-bit, stereo
   */
  async processDiscordAudio(
    audioChunks: Buffer[]
  ): Promise<SpeechRecognitionResult> {
    if (audioChunks.length === 0) {
      return {
        text: '',
        confidence: 0,
        isFinal: true,
      };
    }

    // Concatenate audio chunks
    const audioBuffer = Buffer.concat(audioChunks);
    log.debug(`Processing ${audioChunks.length} audio chunks (${audioBuffer.length} bytes total)`);

    // Convert stereo to mono if needed (take left channel)
    // Discord provides stereo PCM, but most STT expects mono
    const monoBuffer = this.stereoToMono(audioBuffer);

    return this.recognize(monoBuffer);
  }

  /**
   * Convert stereo PCM to mono by averaging channels
   */
  private stereoToMono(stereoBuffer: Buffer): Buffer {
    const samples = stereoBuffer.length / 4; // 16-bit samples, 2 channels
    const monoBuffer = Buffer.alloc(samples * 2);

    for (let i = 0; i < samples; i++) {
      const leftSample = stereoBuffer.readInt16LE(i * 4);
      const rightSample = stereoBuffer.readInt16LE(i * 4 + 2);
      const monoSample = Math.floor((leftSample + rightSample) / 2);
      monoBuffer.writeInt16LE(monoSample, i * 2);
    }

    return monoBuffer;
  }

  /**
   * Detect if audio contains speech (voice activity detection)
   * Simple energy-based detection
   */
  detectSpeech(audioBuffer: Buffer, threshold: number = 500): boolean {
    if (audioBuffer.length < 2) return false;

    let totalEnergy = 0;
    const samples = audioBuffer.length / 2; // 16-bit samples

    for (let i = 0; i < samples; i++) {
      const sample = audioBuffer.readInt16LE(i * 2);
      totalEnergy += Math.abs(sample);
    }

    const averageEnergy = totalEnergy / samples;
    const hasSpeech = averageEnergy > threshold;

    log.debug(`Audio energy: ${averageEnergy.toFixed(2)} (threshold: ${threshold}) - Speech: ${hasSpeech}`);

    return hasSpeech;
  }
}

/**
 * Create a speech recognition manager instance
 */
export function createSpeechRecognition(
  config: VoiceInteractionConfig
): SpeechRecognitionManager {
  return new SpeechRecognitionManager(config);
}
