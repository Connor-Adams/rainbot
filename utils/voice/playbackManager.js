/**
 * Playback Manager - Handles playback control and audio resources
 */
const { createAudioResource, AudioPlayerStatus, StreamType } = require('@discordjs/voice');
const play = require('play-dl');
const youtubedlPkg = require('youtube-dl-exec');
const { spawn } = require('child_process');
const { createLogger } = require('../logger');
const { getVoiceState } = require('./connectionManager');
const storage = require('../storage');

// Use system yt-dlp if available (Railway/nixpkgs), otherwise fall back to bundled
const youtubedl = youtubedlPkg.create(process.env.YTDLP_PATH || 'yt-dlp');

const log = createLogger('PLAYBACK');

/** Cache expiration time for stream URLs (2 hours) */
const CACHE_EXPIRATION_MS = 2 * 60 * 60 * 1000;
/** Maximum number of cached stream URLs before LRU eviction */
const MAX_CACHE_SIZE = 500;
/** Timeout for fetch operations */
const FETCH_TIMEOUT_MS = 10000;

/** @type {Map<string, {url: string, expires: number}>} Cache of video URL -> stream URL */
const urlCache = new Map();

/**
 * Get direct stream URL from yt-dlp (cached for speed)
 * @param {string} videoUrl - YouTube video URL
 * @returns {Promise<string>} Direct stream URL
 */
async function getStreamUrl(videoUrl) {
  // Check cache first
  const cached = urlCache.get(videoUrl);
  if (cached && cached.expires > Date.now()) {
    log.debug(`Using cached stream URL for ${videoUrl}`);
    return cached.url;
  }

  // Get direct URL from yt-dlp
  const result = await youtubedl(videoUrl, {
    format: 'bestaudio[acodec=opus]/bestaudio/best',
    getUrl: true,
    noPlaylist: true,
    noWarnings: true,
    quiet: true,
    noCheckCertificates: true,
  });

  const streamUrl = typeof result === 'string' ? result.trim() : result;

  // LRU eviction if cache is too large
  if (urlCache.size >= MAX_CACHE_SIZE) {
    const oldestKey = urlCache.keys().next().value;
    urlCache.delete(oldestKey);
  }

  // Cache with expiration
  urlCache.set(videoUrl, { url: streamUrl, expires: Date.now() + CACHE_EXPIRATION_MS });

  return streamUrl;
}

/**
 * Create track resource using async fetch method (fastest)
 */
async function createTrackResourceAsync(track) {
  const ytMatch = track.url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  if (ytMatch) {
    try {
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

        const { Readable } = require('stream');
        const nodeStream = Readable.fromWeb(response.body);

        return {
          resource: createAudioResource(nodeStream, { inputType: StreamType.Arbitrary }),
        };
      } catch (fetchError) {
        clearTimeout(timeoutId);
        throw fetchError;
      }
    } catch (error) {
      throw error;
    }
  }
  return null;
}

/**
 * Create track resource using yt-dlp piping (fallback)
 */
function createTrackResource(track) {
  const ytMatch = track.url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  if (ytMatch) {
    const subprocess = youtubedl.exec(track.url, {
      format: 'bestaudio[acodec=opus]/bestaudio',
      output: '-',
      noPlaylist: true,
      noWarnings: true,
      quiet: true,
      noCheckCertificates: true,
      preferFreeFormats: true,
      bufferSize: '16K',
    });

    subprocess.catch((err) =>
      log.debug(`yt-dlp subprocess error (expected on cleanup): ${err.message}`)
    );

    subprocess.stderr?.on('data', (data) => {
      const msg = data.toString().trim();
      if (!msg.includes('Broken pipe')) {
        log.debug(`yt-dlp: ${msg}`);
      }
    });

    return {
      resource: createAudioResource(subprocess.stdout, { inputType: StreamType.Arbitrary }),
      subprocess,
    };
  }
  return null;
}

/**
 * Helper to create audio resource with inline volume support
 * @param {Stream} input - Audio input stream
 * @param {Object} options - Resource options
 * @returns {AudioResource}
 */
function createVolumeResource(input, options = {}) {
  return createAudioResource(input, {
    ...options,
    inlineVolume: true,
  });
}

/**
 * Play a resource with volume applied
 * @param {Object} state - Voice state
 * @param {AudioResource} resource - Audio resource
 */
function playWithVolume(state, resource) {
  if (resource.volume) {
    resource.volume.setVolume((state.volume || 100) / 100);
  }
  state.currentResource = resource;
  state.player.play(resource);
}

/**
 * Play next track in queue
 * @param {string} guildId - Guild ID
 * @returns {Promise<Track|null>} - Next track or null
 */
async function playNext(guildId) {
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

  const nextTrack = state.queue.shift();
  log.debug(`[TIMING] playNext: starting ${nextTrack.title}`);

  try {
    let resource;

    // Handle local/soundboard files
    if (nextTrack.isLocal) {
      if (nextTrack.isStream) {
        resource = createVolumeResource(nextTrack.source, { inputType: StreamType.Arbitrary });
      } else {
        resource = createVolumeResource(nextTrack.source);
      }
    } else {
      // Check if we have this track pre-buffered
      if (state.preBuffered && state.preBuffered.track.url === nextTrack.url) {
        log.debug(`Using pre-buffered stream for: ${nextTrack.title}`);
        resource = state.preBuffered.resource;
        state.preBuffered = null;
      } else {
        // Kill old pre-buffer if it doesn't match
        if (state.preBuffered?.subprocess) {
          state.preBuffered.subprocess.kill?.();
          state.preBuffered = null;
        }

        log.debug(`Streaming: ${nextTrack.url}`);

        const ytMatch = nextTrack.url.match(
          /(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/
        );
        if (ytMatch) {
          // Try async version first (fastest)
          try {
            const result = await createTrackResourceAsync(nextTrack);
            resource = result.resource;
          } catch (error) {
            // Fallback to play-dl
            log.warn(`yt-dlp methods failed for ${nextTrack.title}, trying play-dl...`);
            try {
              const streamInfo = await play.stream(nextTrack.url, { quality: 2 });
              resource = createVolumeResource(streamInfo.stream, {
                inputType: streamInfo.type,
              });
            } catch (playDlError) {
              log.error(
                `All streaming methods failed for ${nextTrack.title}: ${error.message}, ${playDlError.message}`
              );
              throw new Error(`Failed to stream: ${error.message}`);
            }
          }
        } else {
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
        }
      }
    }

    log.debug(`[TIMING] playNext: resource created (${Date.now() - playStartTime}ms)`);
    playWithVolume(state, resource);
    state.nowPlaying = nextTrack.title;
    state.currentTrack = nextTrack;
    state.currentTrackSource = nextTrack.isLocal ? null : nextTrack.url;
    state.playbackStartTime = Date.now();
    state.totalPausedTime = 0;
    state.pauseStartTime = null;
    
    log.debug(`[TIMING] playNext: player.play() called (${Date.now() - playStartTime}ms)`);
    log.info(`Now playing: ${nextTrack.title}`);

    return nextTrack;
  } catch (error) {
    log.error(`Failed to play ${nextTrack.title}: ${error.message}`);

    // Check if it's a recoverable error
    const isRecoverable =
      error.message.includes('403') ||
      error.message.includes('404') ||
      error.message.includes('unavailable') ||
      error.message.includes('deleted') ||
      error.message.includes('terminated') ||
      error.message.includes('Stream fetch failed') ||
      error.message.includes('no longer available');

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
 * @param {string} guildId - Guild ID
 * @returns {{paused: boolean}}
 */
function togglePause(guildId) {
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
 * @param {string} guildId - Guild ID
 * @returns {boolean}
 */
function stopSound(guildId) {
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
 * @param {string} guildId - Guild ID
 * @param {number} level - Volume level (1-100)
 * @returns {number} - Actual volume set
 */
function setVolume(guildId, level) {
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
 * @param {string} guildId - Guild ID
 * @param {AudioResource} resource - Audio resource
 * @param {string} title - Sound title
 */
function playSoundImmediate(guildId, resource, title) {
  const state = getVoiceState(guildId);
  if (!state) {
    throw new Error('Bot is not connected to a voice channel');
  }

  // Kill any existing overlay
  if (state.overlayProcess) {
    try {
      state.overlayProcess.kill('SIGKILL');
    } catch (err) {
      log.debug(`Failed to kill overlay process: ${err.message}`);
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
 * @param {string} guildId - Guild ID
 * @param {string} soundName - Sound file name
 * @returns {Promise<Object>} - Overlay result
 */
async function playSoundboardOverlay(guildId, soundName) {
  const state = getVoiceState(guildId);
  if (!state) {
    throw new Error('Bot is not connected to a voice channel');
  }

  const exists = await storage.soundExists(soundName);
  if (!exists) {
    throw new Error(`Sound file not found: ${soundName}`);
  }

  // For now, just play soundboard directly (full FFmpeg overlay would go here)
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

module.exports = {
  playNext,
  togglePause,
  stopSound,
  setVolume,
  playSoundImmediate,
  playSoundboardOverlay,
  createVolumeResource,
  playWithVolume,
};
