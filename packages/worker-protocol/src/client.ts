import axios, { AxiosInstance, AxiosError } from 'axios';
import { createLogger } from '@rainbot/shared';
import type {
  BotType,
  JoinRequest,
  JoinResponse,
  LeaveRequest,
  LeaveResponse,
  VolumeRequest,
  VolumeResponse,
  StatusRequest,
  StatusResponse,
  HealthResponse,
  EnqueueTrackRequest,
  EnqueueTrackResponse,
  SpeakRequest,
  SpeakResponse,
  PlaySoundRequest,
  PlaySoundResponse,
} from './types';

const log = createLogger('WORKER-CLIENT');

export interface WorkerClientConfig {
  baseUrl: string;
  timeout?: number;
  maxRetries?: number;
}

/**
 * Client for communicating with worker bots
 */
export class WorkerClient {
  private client: AxiosInstance;
  private maxRetries: number;

  constructor(
    private botType: BotType,
    config: WorkerClientConfig
  ) {
    this.maxRetries = config.maxRetries || 3;
    this.client = axios.create({
      baseURL: config.baseUrl,
      timeout: config.timeout || 500, // 500ms default timeout
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Retry logic with exponential backoff
   */
  private async retryRequest<T>(fn: () => Promise<T>, retries = this.maxRetries): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      if (retries > 0 && this.isRetryableError(error)) {
        const delay = Math.pow(2, this.maxRetries - retries) * 100; // 100ms, 200ms, 400ms
        log.warn(
          `Request to ${this.botType} failed, retrying in ${delay}ms (${retries} retries left)`,
          { error: (error as Error).message }
        );
        await this.sleep(delay);
        return this.retryRequest(fn, retries - 1);
      }
      throw error;
    }
  }

  private isRetryableError(error: unknown): boolean {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;
      // Retry on network errors or 5xx status codes
      return (
        !axiosError.response ||
        (axiosError.response.status >= 500 && axiosError.response.status < 600)
      );
    }
    return false;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Join a voice channel
   */
  async join(request: JoinRequest): Promise<JoinResponse> {
    return this.retryRequest(async () => {
      const response = await this.client.post<JoinResponse>('/join', request);
      return response.data;
    });
  }

  /**
   * Leave a voice channel
   */
  async leave(request: LeaveRequest): Promise<LeaveResponse> {
    return this.retryRequest(async () => {
      const response = await this.client.post<LeaveResponse>('/leave', request);
      return response.data;
    });
  }

  /**
   * Set volume
   */
  async setVolume(request: VolumeRequest): Promise<VolumeResponse> {
    return this.retryRequest(async () => {
      const response = await this.client.post<VolumeResponse>('/volume', request);
      return response.data;
    });
  }

  /**
   * Get status
   */
  async getStatus(request: StatusRequest): Promise<StatusResponse> {
    const response = await this.client.get<StatusResponse>('/status', {
      params: request,
    });
    return response.data;
  }

  /**
   * Health check (readiness)
   */
  async healthCheck(): Promise<HealthResponse> {
    const response = await this.client.get<HealthResponse>('/health/ready');
    return response.data;
  }

  /**
   * Enqueue a track (Rainbot only)
   */
  async enqueueTrack(request: EnqueueTrackRequest): Promise<EnqueueTrackResponse> {
    if (this.botType !== 'rainbot') {
      throw new Error(`enqueueTrack is only available for rainbot, not ${this.botType}`);
    }
    return this.retryRequest(async () => {
      const response = await this.client.post<EnqueueTrackResponse>('/enqueue', request);
      return response.data;
    });
  }

  /**
   * Speak TTS (Pranjeet only)
   */
  async speak(request: SpeakRequest): Promise<SpeakResponse> {
    if (this.botType !== 'pranjeet') {
      throw new Error(`speak is only available for pranjeet, not ${this.botType}`);
    }
    return this.retryRequest(async () => {
      const response = await this.client.post<SpeakResponse>('/speak', request);
      return response.data;
    });
  }

  /**
   * Play sound effect (HungerBot only)
   */
  async playSound(request: PlaySoundRequest): Promise<PlaySoundResponse> {
    if (this.botType !== 'hungerbot') {
      throw new Error(`playSound is only available for hungerbot, not ${this.botType}`);
    }
    return this.retryRequest(async () => {
      const response = await this.client.post<PlaySoundResponse>('/play-sound', request);
      return response.data;
    });
  }
}

/**
 * Worker client factory
 */
export function createWorkerClient(botType: BotType, baseUrl: string): WorkerClient {
  return new WorkerClient(botType, { baseUrl });
}
