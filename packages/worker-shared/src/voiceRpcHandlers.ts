import {
  joinVoiceChannel,
  VoiceConnectionStatus,
  entersState,
  createAudioResource,
  StreamType,
} from '@discordjs/voice';
import type { Readable } from 'stream';
import type {
  JoinRequest,
  JoinResponse,
  LeaveRequest,
  LeaveResponse,
  VolumeRequest,
  VolumeResponse,
  SpeakRequest,
  SpeakResponse,
  PlaySoundRequest,
  PlaySoundResponse,
  CleanupUserRequest,
  CleanupUserResponse,
} from '@rainbot/worker-protocol';
import { createLogger } from '@rainbot/shared';
import { logErrorWithStack } from './errors';
import type { RequestCache } from './idempotency';
import { createWorkerDiscordClient } from './client';
import type { GuildState } from './voice-state';

export interface VoiceRpcHandlerOptions {
  client: ReturnType<typeof createWorkerDiscordClient>;
  requestCache: RequestCache;
  getOrCreateGuildState: (guildId: string) => GuildState;
  guildStates: Map<string, GuildState>;
  log: ReturnType<typeof createLogger>;
  /** Called on leave before destroying connection (e.g. Hungerbot stops player) */
  onBeforeLeave?: (state: GuildState) => void;
  /** Called after volume state is updated; use to apply volume to current playback (e.g. TTS) */
  onVolumeChange?: (state: GuildState, volume: number) => void;
}

export function createJoinHandler(options: VoiceRpcHandlerOptions) {
  const { client, requestCache, getOrCreateGuildState, log } = options;

  return async function handleJoin(input: JoinRequest): Promise<JoinResponse> {
    if (!client?.isReady?.()) {
      return { status: 'error', message: 'Worker not ready' };
    }
    const cacheKey = `join:${input.requestId}`;
    if (requestCache.has(cacheKey)) {
      return requestCache.get(cacheKey) as JoinResponse;
    }
    try {
      const guild = client.guilds.cache.get(input.guildId);
      if (!guild) {
        const response: JoinResponse = { status: 'error', message: 'Guild not found' };
        requestCache.set(cacheKey, response);
        return response;
      }
      const channel = guild.channels.cache.get(input.channelId);
      if (!channel || !(channel as { isVoiceBased?: () => boolean }).isVoiceBased?.()) {
        const response: JoinResponse = {
          status: 'error',
          message: 'Voice channel not found',
        };
        requestCache.set(cacheKey, response);
        return response;
      }
      const state = getOrCreateGuildState(input.guildId);
      if (state.connection && state.connection.state.status !== VoiceConnectionStatus.Destroyed) {
        const response: JoinResponse = {
          status: 'already_connected',
          channelId: input.channelId,
        };
        requestCache.set(cacheKey, response);
        return response;
      }
      const connection = joinVoiceChannel({
        channelId: channel.id,
        guildId: guild.id,
        adapterCreator: guild.voiceAdapterCreator as Parameters<
          typeof joinVoiceChannel
        >[0]['adapterCreator'],
        selfDeaf: false,
      });
      connection.subscribe(state.player);
      state.connection = connection;
      connection.on(VoiceConnectionStatus.Disconnected, async () => {
        try {
          await Promise.race([
            entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
            entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
          ]);
        } catch {
          log.warn(`Connection lost in guild ${input.guildId}, attempting rejoin...`);
          connection.destroy();
          state.connection = null;
        }
      });
      const response: JoinResponse = { status: 'joined', channelId: input.channelId };
      requestCache.set(cacheKey, response);
      return response;
    } catch (error) {
      logErrorWithStack(log, 'Join error', error);
      const response: JoinResponse = {
        status: 'error',
        message: (error as Error).message,
      };
      return response;
    }
  };
}

export function createLeaveHandler(options: VoiceRpcHandlerOptions) {
  const { requestCache, guildStates, onBeforeLeave } = options;

  return async function handleLeave(input: LeaveRequest): Promise<LeaveResponse> {
    const cacheKey = `leave:${input.requestId}`;
    if (requestCache.has(cacheKey)) {
      return requestCache.get(cacheKey) as LeaveResponse;
    }
    const state = guildStates.get(input.guildId);
    if (!state || !state.connection) {
      const response: LeaveResponse = { status: 'not_connected' };
      requestCache.set(cacheKey, response);
      return response;
    }
    onBeforeLeave?.(state);
    state.connection.destroy();
    state.connection = null;
    const response: LeaveResponse = { status: 'left' };
    requestCache.set(cacheKey, response);
    return response;
  };
}

export function createVolumeHandler(options: VoiceRpcHandlerOptions) {
  const { requestCache, getOrCreateGuildState, onVolumeChange } = options;

  return async function handleVolume(input: VolumeRequest): Promise<VolumeResponse> {
    if (input.volume < 0 || input.volume > 1) {
      return { status: 'error', message: 'Volume must be between 0 and 1' };
    }
    const cacheKey = `volume:${input.requestId}`;
    if (requestCache.has(cacheKey)) {
      return requestCache.get(cacheKey) as VolumeResponse;
    }
    const state = getOrCreateGuildState(input.guildId);
    state['volume'] = input.volume;
    onVolumeChange?.(state, input.volume);
    const response: VolumeResponse = { status: 'success', volume: input.volume };
    requestCache.set(cacheKey, response);
    return response;
  };
}

// ---------------------------------------------------------------------------
// Speak (TTS) – worker implements speakInGuild
// ---------------------------------------------------------------------------

export interface SpeakHandlerOptions {
  requestCache: RequestCache;
  log: ReturnType<typeof createLogger>;
  speakInGuild: (
    guildId: string,
    text: string,
    voice?: string,
    speed?: number
  ) => Promise<SpeakResponse>;
}

export function createSpeakHandler(options: SpeakHandlerOptions) {
  const { requestCache, log, speakInGuild } = options;

  return async function handleSpeak(input: SpeakRequest): Promise<SpeakResponse> {
    const cacheKey = `speak:${input.requestId}`;
    if (requestCache.has(cacheKey)) {
      return requestCache.get(cacheKey) as SpeakResponse;
    }
    try {
      const response = await speakInGuild(input.guildId, input.text, input.voice, input.speed);
      requestCache.set(cacheKey, response);
      return response;
    } catch (error) {
      logErrorWithStack(log, 'Speak error', error);
      const response: SpeakResponse = {
        status: 'error',
        message: (error as Error).message,
      };
      return response;
    }
  };
}

// ---------------------------------------------------------------------------
// Play sound – worker provides stream + inputType; shared handles play + optional stats
// ---------------------------------------------------------------------------

export interface PlaySoundHandlerOptions {
  requestCache: RequestCache;
  log: ReturnType<typeof createLogger>;
  getOrCreateGuildState: (guildId: string) => GuildState;
  createSoundResource: (
    input: PlaySoundRequest
  ) => Promise<{ stream: Readable; inputType: StreamType }>;
  reportStat?: (
    input: PlaySoundRequest,
    opts?: { logger: ReturnType<typeof createLogger> }
  ) => void | Promise<void>;
}

export function createPlaySoundHandler(options: PlaySoundHandlerOptions) {
  const { requestCache, log, getOrCreateGuildState, createSoundResource, reportStat } = options;

  return async function handlePlaySound(input: PlaySoundRequest): Promise<PlaySoundResponse> {
    const cacheKey = `play-sound:${input.requestId}`;
    if (requestCache.has(cacheKey)) {
      return requestCache.get(cacheKey) as PlaySoundResponse;
    }
    try {
      const state = getOrCreateGuildState(input.guildId);
      if (!state.connection) {
        const response: PlaySoundResponse = {
          status: 'error',
          message: 'Not connected to voice channel',
        };
        requestCache.set(cacheKey, response);
        return response;
      }
      const { stream, inputType } = await createSoundResource(input);
      const resource = createAudioResource(stream, {
        inputType,
        inlineVolume: true,
      });
      const effectiveVolume = input.volume ?? (state['volume'] as number | undefined) ?? 1;
      if (resource.volume) {
        resource.volume.setVolume(effectiveVolume);
      }
      log.debug(
        `Soundboard volume=${effectiveVolume} inputType=${inputType} connected=${state.connection.state.status} player=${state.player.state.status}`
      );
      state.player.stop(true);
      state.player.play(resource);
      log.debug(`Soundboard play issued status=${state.player.state.status}`);
      log.info(`Playing sound ${input.sfxId} for user ${input.userId} in guild ${input.guildId}`);
      void reportStat?.(input, { logger: log });
      const response: PlaySoundResponse = {
        status: 'success',
        message: 'Sound playing',
      };
      requestCache.set(cacheKey, response);
      return response;
    } catch (error) {
      logErrorWithStack(log, 'Play sound error', error);
      const response: PlaySoundResponse = {
        status: 'error',
        message: (error as Error).message,
      };
      return response;
    }
  };
}

// ---------------------------------------------------------------------------
// Cleanup user – stop player in guild; optional worker-specific cleanup
// ---------------------------------------------------------------------------

export interface CleanupUserHandlerOptions {
  guildStates: Map<string, GuildState>;
  onCleanup?: (state: GuildState, input: CleanupUserRequest) => void;
}

export function createCleanupUserHandler(options: CleanupUserHandlerOptions) {
  const { guildStates, onCleanup } = options;

  return async function handleCleanupUser(input: CleanupUserRequest): Promise<CleanupUserResponse> {
    const state = guildStates.get(input.guildId);
    if (state) {
      state.player.stop(true);
      onCleanup?.(state, input);
    }
    return { status: 'success' };
  };
}
