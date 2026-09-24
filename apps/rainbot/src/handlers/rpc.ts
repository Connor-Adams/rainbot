import { Mutex } from 'async-mutex';
import { AudioPlayerStatus } from '@discordjs/voice';
import {
  createJoinHandler,
  createLeaveHandler,
  createVolumeHandler,
  createWorkerDiscordClient,
  type GuildState,
  type RequestCache,
} from '@rainbot/worker-shared';
import type {
  AutoplayResponse,
  ClearResponse,
  EnqueueTrackRequest,
  EnqueueTrackResponse,
  PauseResponse,
  QueueResponse,
  ReplayResponse,
  SeekRequest,
  SeekResponse,
  SkipResponse,
  StopResponse,
} from '@rainbot/worker-protocol';
import { log } from '../config';
import { fetchTracks } from '../voice/trackFetcher';
import { createTrackResourceForAny } from '../voice/audioResource';
import {
  buildPlaybackState,
  buildQueueState,
  getOrCreateGuildState,
  getStateForRpc,
  guildStates,
  markPaused,
  markResumed,
  playNext,
  type RainbotGuildState,
} from '../state/guild-state';

export interface RainbotRpcDeps {
  client: ReturnType<typeof createWorkerDiscordClient>;
  requestCache: RequestCache;
}

export function createRpcHandlers(deps: RainbotRpcDeps) {
  const { client, requestCache } = deps;
  const mutex = new Mutex();

  const sharedOptions = {
    client,
    requestCache,
    getOrCreateGuildState: (guildId: string) =>
      getOrCreateGuildState(guildId) as unknown as GuildState,
    guildStates: guildStates as unknown as Map<string, GuildState>,
    log,
    onBeforeLeave: (state: GuildState) => {
      const rb = state as unknown as RainbotGuildState;
      rb.queue = [];
      rb.currentTrack = null;
    },
    onVolumeChange: (state: GuildState, vol: number) => {
      const rb = state as unknown as RainbotGuildState;
      if (rb.currentResource?.volume) {
        rb.currentResource.volume.setVolume(vol);
      }
    },
  };

  const join = createJoinHandler(sharedOptions);
  const leave = createLeaveHandler(sharedOptions);
  const volume = createVolumeHandler(sharedOptions);

  async function enqueue(input: EnqueueTrackRequest): Promise<EnqueueTrackResponse> {
    const cacheKey = `enqueue:${input.requestId}`;
    if (requestCache.has(cacheKey)) {
      return requestCache.get(cacheKey) as EnqueueTrackResponse;
    }
    const release = await mutex.acquire();
    try {
      const state = getOrCreateGuildState(input.guildId);
      const fetchedTracks = await fetchTracks(input.url, input.guildId);
      if (!fetchedTracks.length) {
        throw new Error('No tracks found for the requested source');
      }
      const tracks = fetchedTracks.map((track) => ({
        ...track,
        kind: 'music' as const,
        userId: input.requestedBy,
        username: input.requestedByUsername || undefined,
      }));
      state.queue.push(...tracks);
      if (state.player.state.status === AudioPlayerStatus.Idle && state.connection) {
        void playNext(input.guildId);
      }
      const response: EnqueueTrackResponse = {
        status: 'success',
        position: state.queue.length - tracks.length + 1,
        message: `Added ${tracks.length} track(s) to queue`,
      };
      requestCache.set(cacheKey, response);
      return response;
    } catch (error) {
      return { status: 'error', message: (error as Error).message };
    } finally {
      release();
    }
  }

  async function skip(input: {
    requestId: string;
    guildId: string;
    count?: number;
  }): Promise<SkipResponse> {
    const count = input.count ?? 1;
    const cacheKey = `skip:${input.requestId}`;
    if (requestCache.has(cacheKey)) {
      return requestCache.get(cacheKey) as SkipResponse;
    }
    const state = guildStates.get(input.guildId);
    if (!state) {
      const response: SkipResponse = { status: 'error', message: 'Not connected' };
      requestCache.set(cacheKey, response);
      return response;
    }
    const skipped: string[] = [];
    if (state.currentTrack) {
      skipped.push(state.currentTrack.title ?? 'Unknown');
    }
    for (let i = 1; i < count && state.queue.length > 0; i++) {
      const removed = state.queue.shift();
      if (removed) skipped.push(removed.title ?? 'Unknown');
    }
    state.player.stop();
    const response: SkipResponse = { status: 'success', skipped };
    requestCache.set(cacheKey, response);
    return response;
  }

  async function pause(input: { requestId: string; guildId: string }): Promise<PauseResponse> {
    const cacheKey = `pause:${input.requestId}`;
    if (requestCache.has(cacheKey)) {
      return requestCache.get(cacheKey) as PauseResponse;
    }
    const state = guildStates.get(input.guildId);
    if (!state) {
      return { status: 'error', message: 'Not connected' };
    }
    let paused: boolean;
    if (state.player.state.status === AudioPlayerStatus.Paused) {
      state.player.unpause();
      markResumed(state);
      paused = false;
    } else {
      state.player.pause();
      markPaused(state);
      paused = true;
    }
    const response: PauseResponse = { status: 'success', paused };
    requestCache.set(cacheKey, response);
    return response;
  }

  async function stop(input: { requestId: string; guildId: string }): Promise<StopResponse> {
    const cacheKey = `stop:${input.requestId}`;
    if (requestCache.has(cacheKey)) {
      return requestCache.get(cacheKey) as StopResponse;
    }
    const state = guildStates.get(input.guildId);
    if (!state) {
      return { status: 'error', message: 'Not connected' };
    }
    state.player.stop();
    state.queue = [];
    state.currentTrack = null;
    state.currentResource = null;
    state.nowPlaying = null;
    state.playbackStartTime = null;
    state.pauseStartTime = null;
    state.totalPausedTime = 0;
    const response: StopResponse = { status: 'success' };
    requestCache.set(cacheKey, response);
    return response;
  }

  async function clear(input: { requestId: string; guildId: string }): Promise<ClearResponse> {
    const cacheKey = `clear:${input.requestId}`;
    if (requestCache.has(cacheKey)) {
      return requestCache.get(cacheKey) as ClearResponse;
    }
    const state = guildStates.get(input.guildId);
    if (!state) {
      return { status: 'error', message: 'Not connected' };
    }
    const cleared = state.queue.length;
    state.queue = [];
    const response: ClearResponse = { status: 'success', cleared };
    requestCache.set(cacheKey, response);
    return response;
  }

  async function getQueue(input: { guildId: string }): Promise<QueueResponse> {
    const state = guildStates.get(input.guildId);
    if (!state) {
      return { queue: [] };
    }
    const playback = buildPlaybackState(state);
    const q = buildQueueState(state, playback);
    const response: QueueResponse = {
      queue: (q.queue ?? []) as QueueResponse['queue'],
      nowPlaying: q.nowPlaying as QueueResponse['nowPlaying'],
      isPaused: q.isPaused,
      isAutoplay: q.isAutoplay,
    };
    if (state.currentTrack && playback.positionMs != null) {
      response.positionMs = playback.positionMs;
    }
    if (state.currentTrack && playback.durationMs != null) {
      response.durationMs = playback.durationMs;
    }
    return response;
  }

  async function autoplay(input: {
    requestId: string;
    guildId: string;
    enabled?: boolean | null;
  }): Promise<AutoplayResponse> {
    const cacheKey = `autoplay:${input.requestId}`;
    if (requestCache.has(cacheKey)) {
      return requestCache.get(cacheKey) as AutoplayResponse;
    }
    const state = getOrCreateGuildState(input.guildId);
    if (input.enabled != null) {
      state.autoplay = input.enabled;
    }
    const response: AutoplayResponse = {
      status: 'success',
      enabled: state.autoplay,
    };
    requestCache.set(cacheKey, response);
    return response;
  }

  async function replay(input: { requestId: string; guildId: string }): Promise<ReplayResponse> {
    const cacheKey = `replay:${input.requestId}`;
    if (requestCache.has(cacheKey)) {
      return requestCache.get(cacheKey) as ReplayResponse;
    }
    const state = guildStates.get(input.guildId);
    if (!state || !state.lastPlayedTrack) {
      const response: ReplayResponse = { status: 'error', message: 'No track to replay' };
      requestCache.set(cacheKey, response);
      return response;
    }
    const track = { ...state.lastPlayedTrack };
    state.queue.unshift(track);
    if (state.player.state.status === AudioPlayerStatus.Idle && state.connection) {
      void playNext(input.guildId);
    }
    const response: ReplayResponse = { status: 'success', track: track.title };
    requestCache.set(cacheKey, response);
    return response;
  }

  async function seek(input: SeekRequest): Promise<SeekResponse> {
    const cacheKey = `seek:${input.requestId}`;
    if (requestCache.has(cacheKey)) {
      return requestCache.get(cacheKey) as SeekResponse;
    }
    const state = guildStates.get(input.guildId);
    if (!state) {
      const response: SeekResponse = { status: 'error', message: 'Not connected' };
      requestCache.set(cacheKey, response);
      return response;
    }
    if (!state.currentTrack) {
      const response: SeekResponse = { status: 'error', message: 'No track playing' };
      requestCache.set(cacheKey, response);
      return response;
    }
    if (!state.connection) {
      const response: SeekResponse = { status: 'error', message: 'Not connected' };
      requestCache.set(cacheKey, response);
      return response;
    }
    const track = state.currentTrack;
    let positionSeconds = Math.max(0, Math.floor(input.positionSeconds));
    if (track.duration != null && track.duration > 0) {
      positionSeconds = Math.min(positionSeconds, track.duration);
    }
    try {
      state.player.stop();
      const resource = await createTrackResourceForAny(track, positionSeconds);
      if (resource.volume) {
        resource.volume.setVolume(state.volume);
      }
      state.currentResource = resource;
      state.playbackStartTime = Date.now() - positionSeconds * 1000;
      state.pauseStartTime = null;
      state.totalPausedTime = 0;
      state.player.play(resource);
      log.info(`Seeked to ${positionSeconds}s in "${track.title}" in guild ${input.guildId}`);
      const response: SeekResponse = { status: 'success' };
      requestCache.set(cacheKey, response);
      return response;
    } catch (error) {
      const err = error as Error;
      log.error(`Seek failed in guild ${input.guildId}: ${err.message}`);
      const response: SeekResponse = { status: 'error', message: err.message };
      requestCache.set(cacheKey, response);
      return response;
    }
  }

  return {
    getState: getStateForRpc,
    join,
    leave,
    volume,
    enqueue,
    skip,
    pause,
    stop,
    clear,
    getQueue,
    autoplay,
    replay,
    seek,
  };
}
