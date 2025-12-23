const { createAudioResource, StreamType } = require('@discordjs/voice');
const play = require('play-dl');
const youtubedlPkg = require('youtube-dl-exec');
const { spawn } = require('child_process');
const { createLogger } = require('../logger');

const log = createLogger('AUDIO_RESOURCE');

// Use system yt-dlp if available (Railway/nixpkgs), otherwise fall back to bundled
const youtubedl = youtubedlPkg.create(process.env.YTDLP_PATH || 'yt-dlp');

/**
 * Cache expiration time for stream URLs (2 hours)
 */
const CACHE_EXPIRATION_MS = 2 * 60 * 60 * 1000;

/**
 * Maximum number of cached stream URLs before LRU eviction
 */
const MAX_CACHE_SIZE = 500;

/**
 * Timeout for fetch operations
 */
const FETCH_TIMEOUT_MS = 10000;

/**
 * @type {Map<string, {url: string, expires: number}>}
 * Cache of video URL -> stream URL
 */
const urlCache = new Map();

/**
 * Helper to create audio resource with inline volume support
 */
function createVolumeResource(input, options = {}) {
  return createAudioResource(input, {
    ...options,
    inlineVolume: true,
  });
}

/**
 * Get direct stream URL from yt-dlp (cached for speed)
 * @param {string} videoUrl - YouTube video URL
 * @returns {Promise<string>} Direct stream URL
 */
async function getStreamUrl(videoUrl) {
  // Check cache first (URLs are valid for a few hours)
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
    log.debug(`Evicted oldest cache entry: ${oldestKey}`);
  }

  // Cache with expiration
  urlCache.set(videoUrl, { url: streamUrl, expires: Date.now() + CACHE_EXPIRATION_MS });

  return streamUrl;
}

/**
 * Create track resource asynchronously using fetch for YouTube videos
 * @param {Object} track - Track object
 * @returns {Promise<Object|null>} Resource and metadata
 */
async function createTrackResourceAsync(track) {
  const ytMatch = track.url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  if (!ytMatch) return null;

  try {
    const streamUrl = await getStreamUrl(track.url);
    log.debug(`Got stream URL, starting fetch...`);

    // Stream directly with fetch (much faster than yt-dlp piping)
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
        log.warn(`Stream fetch failed (${response.status}), falling back to yt-dlp piping`);
        throw new Error(`Stream fetch failed: ${response.status}`);
      }

      const { Readable } = require('stream');
      const nodeStream = Readable.fromWeb(response.body);

      return {
        resource: createAudioResource(nodeStream, { inputType: StreamType.Arbitrary }),
      };
    } catch (fetchError) {
      clearTimeout(timeoutId);
      if (fetchError.name === 'AbortError') {
        log.warn('Fetch timeout, falling back to yt-dlp piping');
        throw new Error('Stream fetch timeout');
      }
      throw fetchError;
    }
  } catch (error) {
    // Fallback to yt-dlp piping if fetch fails
    if (error.message.includes('Stream fetch failed') || error.message.includes('fetch')) {
      log.info(`Using yt-dlp fallback for: ${track.title}`);
      return createTrackResource(track);
    }
    throw error;
  }
}

/**
 * Create track resource using yt-dlp piping
 * @param {Object} track - Track object
 * @returns {Object|null} Resource and subprocess
 */
function createTrackResource(track) {
  const ytMatch = track.url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  if (!ytMatch) return null;

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

/**
 * Create audio resource for any track type
 * @param {Object} track - Track object
 * @param {Object} options - Additional options
 * @returns {Promise<Object>} Resource object
 */
async function createTrackResourceForAny(track, options = {}) {
  const storage = require('../storage');

  // Handle local files/streams
  if (track.isLocal) {
    if (track.isStream) {
      return {
        resource: createVolumeResource(track.source, { inputType: StreamType.Arbitrary }),
      };
    } else {
      return {
        resource: createVolumeResource(track.source),
      };
    }
  }

  // Try async version for YouTube (uses cache + fetch)
  const ytMatch = track.url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  if (ytMatch) {
    try {
      return await createTrackResourceAsync(track);
    } catch (error) {
      // Fallback to play-dl
      log.warn(`yt-dlp methods failed for ${track.title}, trying play-dl...`);
      try {
        const streamInfo = await play.stream(track.url, { quality: 2 });
        return {
          resource: createVolumeResource(streamInfo.stream, {
            inputType: streamInfo.type,
          }),
        };
      } catch (playDlError) {
        log.error(
          `All streaming methods failed for ${track.title}: ${error.message}, ${playDlError.message}`
        );
        throw new Error(`Failed to stream: ${error.message}`);
      }
    }
  }

  // Use play-dl for other platforms
  const urlType = await play.validate(track.url);
  if (urlType) {
    const streamInfo = await play.stream(track.url, { quality: 2 });
    return {
      resource: createVolumeResource(streamInfo.stream, {
        inputType: streamInfo.type,
      }),
    };
  }

  throw new Error('URL no longer valid');
}

/**
 * Create audio resource with seek position
 * @param {Object} track - Track object
 * @param {number} seekSeconds - Position to seek to
 * @returns {Promise<Object>} Resource object
 */
async function createResourceWithSeek(track, seekSeconds) {
  const storage = require('../storage');

  if (track.isLocal) {
    // Local files: use FFmpeg -ss for seeking
    const soundStream = await storage.getSoundStream(track.source || track.title);
    const ffmpeg = spawn(
      'ffmpeg',
      [
        '-ss',
        seekSeconds.toString(),
        '-i',
        'pipe:0',
        '-acodec',
        'libopus',
        '-f',
        'opus',
        '-ar',
        '48000',
        '-ac',
        '2',
        'pipe:1',
      ],
      { stdio: ['pipe', 'pipe', 'pipe'] }
    );

    soundStream.pipe(ffmpeg.stdin);
    ffmpeg.stderr.on('data', () => {}); // Suppress stderr

    return {
      resource: createVolumeResource(ffmpeg.stdout, { inputType: StreamType.OggOpus }),
    };
  }

  // Streams: play-dl supports seek option
  try {
    const streamInfo = await play.stream(track.url, {
      quality: 2,
      seek: seekSeconds,
    });
    return {
      resource: createVolumeResource(streamInfo.stream, { inputType: streamInfo.type }),
      actualSeek: seekSeconds,
    };
  } catch (error) {
    log.error(`Failed to stream with seek for ${track.title}: ${error.message}`);
    // Fall back to streaming from start
    const streamInfo = await play.stream(track.url, { quality: 2 });
    return {
      resource: createVolumeResource(streamInfo.stream, { inputType: streamInfo.type }),
      actualSeek: 0,
    };
  }
}

module.exports = {
  createVolumeResource,
  getStreamUrl,
  createTrackResourceAsync,
  createTrackResource,
  createTrackResourceForAny,
  createResourceWithSeek,
};
