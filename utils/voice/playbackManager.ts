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
import * as stats from '../statistics';
import * as listeningHistory from '../listeningHistory';
import { detectSourceType } from '../sourceType';
import { getDiscordClient } from './discordClient';
import type { Track } from '@rainbot/types/voice';
import type { VoiceState } from '@rainbot/types/voice-modules';
import type { TextChannel, VoiceChannel } from 'discord.js';

// Use system yt-dlp if available (Railway/nixpkgs), otherwise fall back to bundled
const youtubedl = youtubedlPkg.create(process.env['YTDLP_PATH'] || 'yt-dlp');

const log = createLogger('PLAYBACK');

// Cookie file path for YouTube authentication (fixes 403 errors)
const COOKIES_FILE = process.env['YTDLP_COOKIES'] || '';

/**
 * Get common yt-dlp options. extractor-args prefer YouTube clients that work without PO token.
 */
function getYtdlpOptions(): Record<string, unknown> {
  const options: Record<string, unknown> = {
    noPlaylist: true,
    noWarnings: true,
    quiet: true,
    noCheckCertificates: true,
    extractorArgs: 'youtube:player_client=android,tv_embedded',
  };

  if (COOKIES_FILE) {
    options['cookies'] = COOKIES_FILE;
    log.debug(`Using cookies file: ${COOKIES_FILE}`);
  }

  return options;
}

/**
 * Send a "Now Playing" update to the voice channel
 */
async function sendNowPlayingUpdate(guildId: string, track: Track): Promise<void> {
  try {
    const client = getDiscordClient();
    if (!client) return;

    const state = getVoiceState(guildId);
    if (!state) return;

    const guild = client.guilds.cache.get(guildId);
    if (!guild) return;

    const channel = guild.channels.cache.get(state.channelId) as
      | VoiceChannel
      | TextChannel
      | undefined;
    if (!channel || !('send' in channel)) return;

    // Format duration if available
    let durationStr = '';
    if (track.duration) {
      const minutes = Math.floor(track.duration / 60);
      const seconds = track.duration % 60;
      durationStr = ` (${minutes}:${seconds.toString().padStart(2, '0')})`;
    }

    await channel.send(`Now playing: **${track.title}**${durationStr}`);
  } catch (error) {
    const err = error as Error;
    log.debug(`Failed to send now playing update: ${err.message}`);
  }
}

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
    ...getYtdlpOptions(),
    format: 'bestaudio[acodec=opus]/bestaudio/best',
    getUrl: true,
  })) as unknown as string;

  const streamUrl = result.trim();

  // LRU eviction if cache is too large
  if (urlCache.size >= MAX_CACHE_SIZE) {
    const oldestKey = urlCache.keys().next().value;
    if (oldestKey !== undefined) urlCache.delete(oldestKey);
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

      // Handle stream errors to prevent crashes
      nodeStream.on('error', (err) => {
        log.debug(`Stream error (expected on skip/stop): ${(err as Error).message}`);
      });

      // Extract resource to allow adding error handler to playStream after creation
      const resource = createAudioResource(nodeStream, {
        inputType: StreamType.Arbitrary,
        inlineVolume: true,
      });

      // Add error handler to the resource's readable stream to catch any wrapped stream errors
      if (resource.playStream) {
        resource.playStream.on('error', (err) => {
          log.debug(
            `AudioResource stream error (expected on skip/stop): ${(err as Error).message}`
          );
        });
      }

      return {
        resource,
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
 * Helper to create audio resource with conditional volume control based on track type
 * Soundboard tracks never have volume control (always 100%), other tracks do
 */
function createTrackResourceHelper(
  input: Readable | string,
  isSoundboard: boolean,
  options: { inputType?: StreamType } = {}
): AudioResource {
  if (isSoundboard) {
    return createAudioResource(input, options);
  } else {
    return createVolumeResource(input, options);
  }
}

/**
 * Play a resource with volume applied
 */
export function playWithVolume(state: VoiceState, resource: AudioResource): void {
  log.debug(`playWithVolume: hasVolumeControl=${!!resource.volume}, stateVolume=${state.volume}`);
  if (resource.volume) {
    resource.volume.setVolume((state.volume || 100) / 100);
    log.debug(`Initial volume set to ${(state.volume || 100) / 100}`);
  } else {
    log.warn(
      `Resource has no volume control - inlineVolume may not be supported for this stream type`
    );
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
        resource = createTrackResourceHelper(
          nextTrack.source as unknown as Readable,
          nextTrack.isSoundboard || false,
          { inputType: StreamType.Arbitrary }
        );
      } else if (nextTrack.source) {
        const soundStream = await storage.getSoundStream(nextTrack.source);
        resource = createTrackResourceHelper(soundStream, nextTrack.isSoundboard || false);
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
              resource = createTrackResourceHelper(
                streamInfo.stream as Readable,
                nextTrack.isSoundboard || false,
                { inputType: streamInfo.type }
              );
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
            resource = createTrackResourceHelper(
              streamInfo.stream as Readable,
              nextTrack.isSoundboard || false,
              { inputType: streamInfo.type }
            );
          } else {
            throw new Error('URL no longer valid');
          }
        } else {
          throw new Error('Track has no URL');
        }
      }
    }

    log.debug(`[TIMING] playNext: resource created (${Date.now() - playStartTime}ms)`);

    // Soundboard tracks play at full volume without volume control
    if (nextTrack.isSoundboard) {
      log.debug(
        `Playing soundboard resource, readable=${resource.readable}, playStream=${!!resource.playStream}`
      );
      state.player.play(resource);
      // Don't set currentResource - this prevents volume control from affecting soundboard playback
      // (soundboard should always play at 100% volume regardless of user's volume setting)
      state.currentResource = null;
    } else {
      log.debug(
        `Playing track resource, readable=${resource.readable}, playStream=${!!resource.playStream}, hasVolume=${!!resource.volume}`
      );
      playWithVolume(state, resource);
    }

    // Log player state after play() call
    log.debug(`Player state after play(): ${state.player.state.status}`);

    const title = nextTrack.title ?? 'Unknown';
    state.nowPlaying = title;
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
    log.info(`Now playing: ${title}`);

    // Send now playing update to voice channel (not for soundboard)
    if (!nextTrack.isSoundboard) {
      sendNowPlayingUpdate(guildId, nextTrack);
    }

    // Track non-soundboard plays in statistics and listening history
    if (!nextTrack.isSoundboard) {
      const userId = nextTrack.userId || state.lastUserId || '';
      const username = nextTrack.username || state.lastUsername || null;
      const discriminator = nextTrack.discriminator || state.lastDiscriminator || null;
      const trackSource = nextTrack.source || 'discord';
      const sourceType = detectSourceType(nextTrack);

      if (userId) {
        // Track in sound_stats
        stats.trackSound(
          title,
          userId,
          guildId,
          sourceType,
          false, // not soundboard
          nextTrack.duration || null,
          trackSource,
          username,
          discriminator
        );

        // Track in listening_history
        listeningHistory
          .trackPlayed(
            userId,
            guildId,
            {
              title,
              url: nextTrack.url || '',
              duration: nextTrack.duration,
              isLocal: nextTrack.isLocal,
              isSoundboard: false,
              source: trackSource,
            },
            nextTrack.userId || state.lastUserId || null
          )
          .catch((err: Error) => log.error(`Failed to track listening history: ${err.message}`));
      }
    }

    // Increment session track count
    stats.incrementSessionTracks(guildId);

    // Track that all users in channel heard this track
    if (!nextTrack.isSoundboard) {
      const sourceType = detectSourceType(nextTrack);
      stats.trackUserListen(
        guildId,
        state.channelId,
        title,
        nextTrack.url || null,
        sourceType,
        nextTrack.duration || null,
        nextTrack.userId || state.lastUserId || null
      );

      // Start track engagement tracking (completion vs skip)
      stats.startTrackEngagement(
        guildId,
        state.channelId,
        title,
        nextTrack.url || null,
        sourceType,
        nextTrack.duration || null,
        nextTrack.userId || state.lastUserId || null
      );
    }

    return nextTrack;
  } catch (error) {
    const err = error as Error;
    log.error(`Failed to play ${nextTrack.title ?? 'Unknown'}: ${err.message}`);

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
      log.warn(`Skipping track due to error: ${nextTrack.title ?? 'Unknown'}`);
    }

    // Try to play next track automatically
    if (state.queue.length > 0) {
      log.info(`Auto-advancing to next track in queue...`);
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
export function togglePause(
  guildId: string,
  userId: string | null = null,
  username: string | null = null
): { paused: boolean } {
  const state = getVoiceState(guildId);
  if (!state) {
    throw new Error('Bot is not connected to a voice channel');
  }

  if (state.overlayProcess) {
    log.debug('Overlay active, ignoring pause/resume');
    return { paused: state.player.state.status === AudioPlayerStatus.Paused };
  }

  // Calculate current playback position for tracking
  let playbackPosition = 0;
  if (state.playbackStartTime && state.currentTrack) {
    const elapsed = Date.now() - state.playbackStartTime;
    const pausedTime = state.totalPausedTime || 0;
    const currentPauseTime = state.pauseStartTime ? Date.now() - state.pauseStartTime : 0;
    playbackPosition = Math.floor((elapsed - pausedTime - currentPauseTime) / 1000);
  }

  if (state.player.state.status === AudioPlayerStatus.Paused) {
    state.player.unpause();
    if (state.pauseStartTime) {
      const pauseDuration = Date.now() - state.pauseStartTime;
      state.totalPausedTime = (state.totalPausedTime || 0) + pauseDuration;
      state.pauseStartTime = null;
    }
    log.info('Resumed playback');

    // Track resume state change
    stats.trackPlaybackStateChange(
      guildId,
      state.channelId,
      'resume',
      'paused',
      'playing',
      userId,
      username,
      state.nowPlaying || null,
      playbackPosition,
      'discord'
    );

    return { paused: false };
  } else if (state.player.state.status === AudioPlayerStatus.Playing) {
    state.player.pause();
    state.pauseStartTime = Date.now();
    log.info('Paused playback');

    // Track pause state change
    stats.trackPlaybackStateChange(
      guildId,
      state.channelId,
      'pause',
      'playing',
      'paused',
      userId,
      username,
      state.nowPlaying || null,
      playbackPosition,
      'discord'
    );

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
export function setVolume(
  guildId: string,
  level: number,
  userId: string | null = null,
  username: string | null = null
): number {
  const state = getVoiceState(guildId);
  if (!state) {
    throw new Error('Bot is not connected to a voice channel');
  }

  const oldVolume = state.volume || 100;
  const volume = Math.max(1, Math.min(100, level));
  state.volume = volume;

  log.debug(
    `setVolume: level=${volume}, hasResource=${!!state.currentResource}, hasVolumeControl=${!!state.currentResource?.volume}`
  );

  if (state.currentResource && state.currentResource.volume) {
    state.currentResource.volume.setVolume(volume / 100);
    log.debug(`Volume applied: ${volume / 100}`);
  }

  // Calculate current playback position for tracking
  let playbackPosition = 0;
  if (state.playbackStartTime && state.currentTrack) {
    const elapsed = Date.now() - state.playbackStartTime;
    const pausedTime = state.totalPausedTime || 0;
    const currentPauseTime = state.pauseStartTime ? Date.now() - state.pauseStartTime : 0;
    playbackPosition = Math.floor((elapsed - pausedTime - currentPauseTime) / 1000);
  }

  // Track volume state change
  stats.trackPlaybackStateChange(
    guildId,
    state.channelId,
    'volume',
    String(oldVolume),
    String(volume),
    userId,
    username,
    state.nowPlaying || null,
    playbackPosition,
    'discord'
  );

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

  log.debug(
    `playSoundImmediate: resource readable=${resource.readable}, playStream=${!!resource.playStream}`
  );
  state.player.play(resource);
  log.debug(`playSoundImmediate: player state after play()=${state.player.state.status}`);
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

  // Handle stream errors to prevent crashes
  soundStream.on('error', (err) => {
    log.debug(`Soundboard stream error: ${(err as Error).message}`);
  });

  const resource = createAudioResource(soundStream, { inputType: StreamType.Arbitrary });

  // Add error handler to the resource's readable stream to catch any wrapped stream errors
  if (resource.playStream) {
    resource.playStream.on('error', (err) => {
      log.debug(`AudioResource stream error: ${(err as Error).message}`);
    });
  }

  playSoundImmediate(guildId, resource, `Sound: ${soundName}`);

  return {
    overlaid: false,
    sound: soundName,
    message: 'Playing soundboard (overlay not implemented)',
  };
}

/**
 * Play a track with optional seek position (for crash recovery)
 */
export async function playWithSeek(
  state: VoiceState,
  track: Track,
  seekSeconds: number,
  isPaused: boolean
): Promise<void> {
  // Import storage dynamically to avoid circular dependency
  const storage = await import('../storage');

  log.info(`Resuming playback of "${track.title}" at ${seekSeconds}s (paused: ${isPaused})`);

  try {
    let resource: AudioResource;

    // Handle local/soundboard files (no seek support)
    if (track.isLocal) {
      if (track.source) {
        const soundStream = await storage.getSoundStream(track.source);
        resource = createTrackResourceHelper(soundStream, track.isSoundboard || false);
      } else {
        throw new Error('Local track missing source');
      }
    } else if (track.url) {
      // For YouTube, use yt-dlp with seek support
      const ytMatch = track.url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);

      if (ytMatch && seekSeconds > 0) {
        // Use yt-dlp with download section for seeking
        log.debug(`Using yt-dlp with seek to ${seekSeconds}s`);
        const result = (await youtubedl(track.url, {
          format: 'bestaudio[acodec=opus]/bestaudio/best',
          getUrl: true,
          noPlaylist: true,
          noWarnings: true,
          quiet: true,
          noCheckCertificates: true,
          downloadSections: `*${seekSeconds}-inf`,
        })) as unknown as string;

        const streamUrl = result.trim();

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

        const response = await fetch(streamUrl, {
          signal: controller.signal,
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            Accept: '*/*',
            Range: 'bytes=0-',
            Referer: 'https://www.youtube.com/',
            Origin: 'https://www.youtube.com',
          },
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`Stream fetch failed: ${response.status}`);
        }

        const nodeStream = Readable.fromWeb(
          response.body as Parameters<typeof Readable.fromWeb>[0]
        );
        nodeStream.on('error', (err) => {
          log.debug(`Stream error (expected on skip/stop): ${(err as Error).message}`);
        });

        resource = createAudioResource(nodeStream, {
          inputType: StreamType.Arbitrary,
          inlineVolume: true,
        });

        // Add error handler to the resource's readable stream to catch any wrapped stream errors
        if (resource.playStream) {
          resource.playStream.on('error', (err) => {
            log.debug(`AudioResource stream error (expected on skip/stop): ${err.message}`);
          });
        }
      } else {
        // No seek needed or not YouTube, use normal playback
        const result = await createTrackResourceAsync(track);
        if (result) {
          resource = result.resource;
        } else {
          // Fallback to play-dl
          const streamInfo = await play.stream(track.url, { quality: 2 });
          resource = createTrackResourceHelper(streamInfo.stream, track.isSoundboard || false, {
            inputType: streamInfo.type,
          });
        }
      }
    } else {
      throw new Error('Track has no URL');
    }

    // Apply volume and play
    playWithVolume(state, resource);
    const title = track.title ?? 'Unknown';
    state.nowPlaying = title;
    state.currentTrack = track;
    state.currentTrackSource = track.isLocal ? null : track.url || null;
    state.playbackStartTime = Date.now() - seekSeconds * 1000; // Offset to account for seek
    state.totalPausedTime = 0;
    state.pauseStartTime = null;

    // Pause if needed
    if (isPaused) {
      state.player.pause();
      state.pauseStartTime = Date.now();
    }

    log.info(`Resumed: ${title} at ${seekSeconds}s`);
  } catch (error) {
    const err = error as Error;
    log.error(`Failed to resume ${track.title ?? 'Unknown'}: ${err.message}`);
    throw err;
  }
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
