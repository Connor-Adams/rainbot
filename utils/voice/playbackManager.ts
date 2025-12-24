/**
 * Playback Manager - Handles playback control and audio resources
 */
import {
  createAudioResource,
  AudioPlayerStatus,
  StreamType,
  AudioResource,
} from '@discordjs/voice';
import play from 'play-dl';
import youtubedlPkg from 'youtube-dl-exec';
import { Readable } from 'stream';
import { createLogger } from '../logger';
import { getVoiceState } from './connectionManager';
import type { Track } from '../../types/voice';
import type { VoiceState } from '../../types/voice-modules';

// Use system yt-dlp if available (Railway/nixpkgs), otherwise fall back to bundled
const youtubedl = youtubedlPkg.create(process.env['YTDLP_PATH'] || 'yt-dlp');

const log = createLogger('PLAYBACK');

/** Cache expiration time for stream URLs (2 hours) */
const CACHE_EXPIRATION_MS = 2 * 60 * 60 * 1000;
/** Maximum number of cached stream URLs before LRU eviction */
const MAX_CACHE_SIZE = 500;
/** Timeout for fetch operations */
const FETCH_TIMEOUT_MS = 10000;

interface CacheEntry {
  url: string;
  expires: number;
}

/** Cache of video URL -> stream URL */
const urlCache = new Map<string, CacheEntry>();

/**
 * Get direct stream URL from yt-dlp (cached for speed)
 */
async function getStreamUrl(videoUrl: string): Promise<string> {
  // Check cache first
  const cached = urlCache.get(videoUrl);
  if (cached && cached.expires > Date.now()) {
    log.debug(`Using cached stream URL for ${videoUrl}`);
    return cached.url;
  }

  // Get direct URL from yt-dlp
  const result = (await youtubedl(videoUrl, {
    format: 'bestaudio[acodec=opus]/bestaudio/best',
    getUrl: true,
    noPlaylist: true,
    noWarnings: true,
    quiet: true,
    noCheckCertificates: true,
  })) as unknown as string;

  const streamUrl = result.trim();

  // LRU eviction if cache is too large
  if (urlCache.size >= MAX_CACHE_SIZE) {
    const oldestKey = urlCache.keys().next().value;
    if (oldestKey) urlCache.delete(oldestKey);
  }

  // Cache with expiration
  urlCache.set(videoUrl, { url: streamUrl, expires: Date.now() + CACHE_EXPIRATION_MS });

  return streamUrl;
}

interface TrackResourceResult {
  resource: AudioResource;
  subprocess?: { kill: () => void };
}

/**
 * Create track resource using async fetch method (fastest)
 */
async function createTrackResourceAsync(track: Track): Promise<TrackResourceResult | null> {
  if (!track.url) return null;

  const ytMatch = track.url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  if (ytMatch) {
    const streamUrl = await getStreamUrl(track.url);
    log.debug(`Got stream URL, starting fetch...`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(streamUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: '*/*',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'identity',
          Range: 'bytes=0-',
          Referer: 'https://www.youtube.com/',
          Origin: 'https://www.youtube.com',
        },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Stream fetch failed: ${response.status}`);
      }

      const nodeStream = Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]);

      return {
        resource: createAudioResource(nodeStream, {
          inputType: StreamType.Arbitrary,
          inlineVolume: true,
        }),
      };
    } catch (fetchError) {
      clearTimeout(timeoutId);
      throw fetchError;
    }
  }
  return null;
}

/**
 * Helper to create audio resource with inline volume support
 */
export function createVolumeResource(
  input: Readable | string,
  options: { inputType?: StreamType } = {}
): AudioResource {
  return createAudioResource(input, {
    ...options,
    inlineVolume: true,
  });
}

/**
 * Play a resource with volume applied
 */
export function playWithVolume(state: VoiceState, resource: AudioResource): void {
  if (resource.volume) {
    resource.volume.setVolume((state.volume || 100) / 100);
  }
  state.currentResource = resource;
  state.player.play(resource);
}

/**
 * Play next track in queue
 */
export async function playNext(guildId: string): Promise<Track | null> {
  // Import storage dynamically to avoid circular dependency
  const storage = await import('../storage');

  const playStartTime = Date.now();
  const state = getVoiceState(guildId);
  if (!state || state.queue.length === 0) {
    if (state) {
      state.nowPlaying = null;
      state.currentTrack = null;
      state.preBuffered = null;
      state.currentResource = null;
    }
    return null;
  }

  const nextTrack = state.queue.shift()!;
  log.debug(`[TIMING] playNext: starting ${nextTrack.title}`);

  try {
    let resource: AudioResource;

    // Handle local/soundboard files
    if (nextTrack.isLocal) {
      if (nextTrack.isStream && nextTrack.source) {
        resource = createVolumeResource(nextTrack.source as unknown as Readable, {
          inputType: StreamType.Arbitrary,
        });
      } else if (nextTrack.source) {
        const soundStream = await storage.getSoundStream(nextTrack.source);
        resource = createVolumeResource(soundStream);
      } else {
        throw new Error('Local track missing source');
      }
    } else {
      // Check if we have this track pre-buffered
      const preBuffered = state.preBuffered as {
        track: Track;
        resource: AudioResource;
        subprocess?: { kill: () => void };
      } | null;
      if (preBuffered && nextTrack.url && preBuffered.track.url === nextTrack.url) {
        log.debug(`Using pre-buffered stream for: ${nextTrack.title}`);
        resource = preBuffered.resource;
        state.preBuffered = null;
      } else {
        // Kill old pre-buffer if it doesn't match
        if (preBuffered?.subprocess) {
          preBuffered.subprocess.kill?.();
          state.preBuffered = null;
        }

        log.debug(`Streaming: ${nextTrack.url}`);

        const ytMatch = nextTrack.url?.match(
          /(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/
        );
        if (ytMatch && nextTrack.url) {
          // Try async version first (fastest)
          try {
            const result = await createTrackResourceAsync(nextTrack);
            if (result) {
              resource = result.resource;
            } else {
              throw new Error('Failed to create async resource');
            }
          } catch (error) {
            const err = error as Error;
            // Fallback to play-dl
            log.warn(`yt-dlp methods failed for ${nextTrack.title}, trying play-dl...`);
            try {
              const streamInfo = await play.stream(nextTrack.url, { quality: 2 });
              resource = createVolumeResource(streamInfo.stream, {
                inputType: streamInfo.type,
              });
            } catch (playDlError) {
              const playErr = playDlError as Error;
              log.error(
                `All streaming methods failed for ${nextTrack.title}: ${err.message}, ${playErr.message}`
              );
              throw new Error(`Failed to stream: ${err.message}`);
            }
          }
        } else if (nextTrack.url) {
          // Use play-dl for other platforms
          const urlType = await play.validate(nextTrack.url);
          if (urlType) {
            const streamInfo = await play.stream(nextTrack.url, { quality: 2 });
            resource = createVolumeResource(streamInfo.stream, {
              inputType: streamInfo.type,
            });
          } else {
            throw new Error('URL no longer valid');
          }
        } else {
          throw new Error('Track has no URL');
        }
      }
    }

    log.debug(`[TIMING] playNext: resource created (${Date.now() - playStartTime}ms)`);
    playWithVolume(state, resource);
    state.nowPlaying = nextTrack.title;
    state.currentTrack = nextTrack;
    state.currentTrackSource = nextTrack.isLocal ? null : nextTrack.url || null;
    state.playbackStartTime = Date.now();
    state.totalPausedTime = 0;
    state.pauseStartTime = null;

    // Store for replay (only non-soundboard tracks with URLs)
    if (!nextTrack.isSoundboard && nextTrack.url) {
      state.lastPlayedTrack = nextTrack;
    }

    log.debug(`[TIMING] playNext: player.play() called (${Date.now() - playStartTime}ms)`);
    log.info(`Now playing: ${nextTrack.title}`);

    return nextTrack;
  } catch (error) {
    const err = error as Error;
    log.error(`Failed to play ${nextTrack.title}: ${err.message}`);

    // Check if it's a recoverable error
    const isRecoverable =
      err.message.includes('403') ||
      err.message.includes('404') ||
      err.message.includes('unavailable') ||
      err.message.includes('deleted') ||
      err.message.includes('terminated') ||
      err.message.includes('Stream fetch failed') ||
      err.message.includes('no longer available');

    if (isRecoverable) {
      log.warn(`Skipping track due to error: ${nextTrack.title}`);
    }

    // Try to play next track automatically
    if (state.queue.length > 0) {
      log.info(`Auto-advancing to next track in queue...`);
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return playNext(guildId);
    } else {
      state.nowPlaying = null;
      state.currentTrack = null;
      log.info(`Queue exhausted after error`);
      return null;
    }
  }
}

/**
 * Toggle pause/resume playback
 */
export function togglePause(guildId: string): { paused: boolean } {
  const state = getVoiceState(guildId);
  if (!state) {
    throw new Error('Bot is not connected to a voice channel');
  }

  if (state.overlayProcess) {
    log.debug('Overlay active, ignoring pause/resume');
    return { paused: state.player.state.status === AudioPlayerStatus.Paused };
  }

  if (state.player.state.status === AudioPlayerStatus.Paused) {
    state.player.unpause();
    if (state.pauseStartTime) {
      const pauseDuration = Date.now() - state.pauseStartTime;
      state.totalPausedTime = (state.totalPausedTime || 0) + pauseDuration;
      state.pauseStartTime = null;
    }
    log.info('Resumed playback');
    return { paused: false };
  } else if (state.player.state.status === AudioPlayerStatus.Playing) {
    state.player.pause();
    state.pauseStartTime = Date.now();
    log.info('Paused playback');
    return { paused: true };
  } else {
    throw new Error('Nothing is playing');
  }
}

/**
 * Stop current playback and clear queue
 */
export function stopSound(guildId: string): boolean {
  const state = getVoiceState(guildId);
  if (state && state.player) {
    state.queue = [];
    state.player.stop();
    state.nowPlaying = null;
    state.currentTrack = null;
    state.currentTrackSource = null;
    state.currentResource = null;
    state.playbackStartTime = null;
    state.pauseStartTime = null;
    state.totalPausedTime = 0;
    log.debug(`Stopped playback in guild ${guildId}`);
    return true;
  }
  return false;
}

/**
 * Set volume for a guild
 */
export function setVolume(guildId: string, level: number): number {
  const state = getVoiceState(guildId);
  if (!state) {
    throw new Error('Bot is not connected to a voice channel');
  }

  const volume = Math.max(1, Math.min(100, level));
  state.volume = volume;

  if (state.currentResource && state.currentResource.volume) {
    state.currentResource.volume.setVolume(volume / 100);
  }

  log.info(`Set volume to ${volume}%`);
  return volume;
}

/**
 * Play a sound immediately (interrupts current playback)
 */
export function playSoundImmediate(guildId: string, resource: AudioResource, title: string): void {
  const state = getVoiceState(guildId);
  if (!state) {
    throw new Error('Bot is not connected to a voice channel');
  }

  // Kill any existing overlay
  const overlayProcess = state.overlayProcess as { kill: (signal?: string) => void } | null;
  if (overlayProcess) {
    try {
      overlayProcess.kill('SIGKILL');
    } catch (err) {
      const e = err as Error;
      log.debug(`Failed to kill overlay process: ${e.message}`);
    }
    state.overlayProcess = null;
  }

  state.player.play(resource);
  state.nowPlaying = title;
  state.currentTrackSource = null;
  log.info(`Playing sound immediately: ${title}`);
}

/**
 * Play soundboard overlay on current music
 */
export async function playSoundboardOverlay(
  guildId: string,
  soundName: string
): Promise<{ overlaid: boolean; sound: string; message: string }> {
  // Import storage dynamically to avoid circular dependency
  const storage = await import('../storage');

  const state = getVoiceState(guildId);
  if (!state) {
    throw new Error('Bot is not connected to a voice channel');
  }

  const exists = await storage.soundExists(soundName);
  if (!exists) {
    throw new Error(`Sound file not found: ${soundName}`);
  }

  // Soundboard plays at full volume (no volume control)
  log.info(`Playing soundboard: ${soundName}`);
  const soundStream = await storage.getSoundStream(soundName);
  const resource = createAudioResource(soundStream, { inputType: StreamType.Arbitrary });

  playSoundImmediate(guildId, resource, `🔊 ${soundName}`);

  return {
    overlaid: false,
    sound: soundName,
    message: 'Playing soundboard (overlay not implemented)',
  };
}

/**
 * Replay the last played track (not soundboard)
 */
export async function replay(guildId: string): Promise<Track | null> {
  const state = getVoiceState(guildId);
  if (!state) {
    throw new Error('Bot is not connected to a voice channel');
  }

  if (!state.lastPlayedTrack) {
    throw new Error('No track to replay');
  }

  const track = { ...state.lastPlayedTrack };
  log.info(`Replaying: ${track.title}`);

  // Add to front of queue and play
  state.queue.unshift(track);

  // Stop current playback to trigger next
  state.player.stop();

  return track;
}
