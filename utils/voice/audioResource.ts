import { createAudioResource, StreamType, AudioResource } from '@discordjs/voice';
import play from 'play-dl';
import youtubedlPkg from 'youtube-dl-exec';
import { spawn, ChildProcess } from 'child_process';
import { Readable } from 'stream';
import { createLogger } from '../logger';
import type { Track } from '../../types/voice';

const log = createLogger('AUDIO_RESOURCE');

// Use system yt-dlp if available (Railway/nixpkgs), otherwise fall back to bundled
const youtubedl = youtubedlPkg.create(process.env['YTDLP_PATH'] || 'yt-dlp');

// Cookie file path for YouTube authentication (fixes 403 errors)
const COOKIES_FILE = process.env['YTDLP_COOKIES'] || '';

/**
 * Get common yt-dlp options including cookies if configured
 */
function getYtdlpOptions(): Record<string, unknown> {
  const options: Record<string, unknown> = {
    noPlaylist: true,
    noWarnings: true,
    quiet: true,
    noCheckCertificates: true,
  };

  if (COOKIES_FILE) {
    options['cookies'] = COOKIES_FILE;
    log.debug(`Using cookies file: ${COOKIES_FILE}`);
  }

  return options;
}

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

interface CacheEntry {
  url: string;
  expires: number;
}

/**
 * Cache of video URL -> stream URL
 */
const urlCache = new Map<string, CacheEntry>();

export interface TrackResourceResult {
  resource: AudioResource;
  subprocess?: ChildProcess;
  actualSeek?: number;
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
export function createResourceForTrack(
  input: Readable | string,
  track: Track,
  options: { inputType?: StreamType } = {}
): AudioResource {
  // Soundboard files should NOT have volume control
  if (track.isSoundboard) {
    return createAudioResource(input, options);
  } else {
    return createVolumeResource(input, options);
  }
}

/**
 * Get direct stream URL from yt-dlp (cached for speed)
 */
export async function getStreamUrl(videoUrl: string): Promise<string> {
  // Check cache first (URLs are valid for a few hours)
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
    if (oldestKey) urlCache.delete(oldestKey);
    log.debug(`Evicted oldest cache entry: ${oldestKey}`);
  }

  // Cache with expiration
  urlCache.set(videoUrl, { url: streamUrl, expires: Date.now() + CACHE_EXPIRATION_MS });

  return streamUrl;
}

/**
 * Create track resource asynchronously using fetch for YouTube videos
 */
export async function createTrackResourceAsync(track: Track): Promise<TrackResourceResult | null> {
  if (!track.url) return null;

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
        // Invalidate cache on 403 (URL expired or blocked)
        if (response.status === 403) {
          urlCache.delete(track.url!);
          log.warn(`403 Forbidden - cached URL invalidated for ${track.url}`);
        }
        log.warn(`Stream fetch failed (${response.status}), falling back to yt-dlp piping`);
        throw new Error(`Stream fetch failed: ${response.status}`);
      }

      const nodeStream = Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]);

      // Handle stream errors to prevent crashes
      nodeStream.on('error', (err) => {
        log.debug(`Stream error (expected on skip/stop): ${err.message}`);
      });

      return {
        resource: createAudioResource(nodeStream, {
          inputType: StreamType.Arbitrary,
          inlineVolume: !track.isSoundboard, // Soundboard tracks should NOT have volume control
        }),
      };
    } catch (fetchError) {
      clearTimeout(timeoutId);
      const err = fetchError as Error;
      if (err.name === 'AbortError') {
        log.warn('Fetch timeout, falling back to yt-dlp piping');
        throw new Error('Stream fetch timeout');
      }
      throw fetchError;
    }
  } catch (error) {
    const err = error as Error;
    // Fallback to yt-dlp piping if fetch fails
    if (err.message.includes('Stream fetch failed') || err.message.includes('fetch')) {
      log.info(`Using yt-dlp fallback for: ${track.title}`);
      return createTrackResource(track);
    }
    throw error;
  }
}

/**
 * Create track resource using yt-dlp piping
 */
export function createTrackResource(track: Track): TrackResourceResult | null {
  if (!track.url) return null;

  const ytMatch = track.url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  if (!ytMatch) return null;

  const subprocess = youtubedl.exec(track.url, {
    ...getYtdlpOptions(),
    format: 'bestaudio[acodec=opus]/bestaudio',
    output: '-',
    preferFreeFormats: true,
    bufferSize: '16K',
  });

  subprocess.catch((err: Error) =>
    log.debug(`yt-dlp subprocess error (expected on cleanup): ${err.message}`)
  );

  subprocess.stderr?.on('data', (data: Buffer) => {
    const msg = data.toString().trim();
    if (!msg.includes('Broken pipe')) {
      log.debug(`yt-dlp: ${msg}`);
    }
  });

  // Handle stdout errors to prevent crashes
  subprocess.stdout?.on('error', (err) => {
    log.debug(`yt-dlp stdout error (expected on skip/stop): ${err.message}`);
  });

  return {
    resource: createAudioResource(subprocess.stdout as Readable, {
      inputType: StreamType.Arbitrary,
      inlineVolume: !track.isSoundboard, // Soundboard tracks should NOT have volume control
    }),
    subprocess,
  };
}

/**
 * Create audio resource for any track type
 */
export async function createTrackResourceForAny(
  track: Track,
  _options: Record<string, unknown> = {}
): Promise<TrackResourceResult> {
  // Import storage dynamically to avoid circular dependency
  const storage = await import('../storage');

  // Handle local files/streams
  if (track.isLocal) {
    if (track.isStream && track.source) {
      return {
        resource: createResourceForTrack(track.source as unknown as Readable, track, {
          inputType: StreamType.Arbitrary,
        }),
      };
    } else if (track.source) {
      const soundStream = await storage.getSoundStream(track.source);
      return {
        resource: createResourceForTrack(soundStream, track),
      };
    }
    throw new Error('Local track missing source');
  }

  if (!track.url) {
    throw new Error('Track URL is required');
  }

  // Try async version for YouTube (uses cache + fetch)
  const ytMatch = track.url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  if (ytMatch) {
    try {
      const result = await createTrackResourceAsync(track);
      if (result) return result;
    } catch (error) {
      const err = error as Error;
      // Fallback to play-dl
      log.warn(`yt-dlp methods failed for ${track.title}, trying play-dl...`);
      try {
        const streamInfo = await play.stream(track.url, { quality: 2 });
        return {
          resource: createResourceForTrack(streamInfo.stream, track, {
            inputType: streamInfo.type,
          }),
        };
      } catch (playDlError) {
        const playErr = playDlError as Error;
        log.error(
          `All streaming methods failed for ${track.title}: ${err.message}, ${playErr.message}`
        );
        throw new Error(`Failed to stream: ${err.message}`);
      }
    }
  }

  // Use play-dl for other platforms
  const urlType = await play.validate(track.url);
  if (urlType) {
    const streamInfo = await play.stream(track.url, { quality: 2 });
    return {
      resource: createResourceForTrack(streamInfo.stream, track, {
        inputType: streamInfo.type,
      }),
    };
  }

  throw new Error('URL no longer valid');
}

/**
 * Create audio resource with seek position
 */
export async function createResourceWithSeek(
  track: Track,
  seekSeconds: number
): Promise<TrackResourceResult> {
  // Import storage dynamically to avoid circular dependency
  const storage = await import('../storage');

  if (track.isLocal && track.source) {
    // Local files: use FFmpeg -ss for seeking
    const soundStream = await storage.getSoundStream(track.source);
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

    soundStream.pipe(ffmpeg.stdin as NodeJS.WritableStream);
    ffmpeg.stderr?.on('data', () => {}); // Suppress stderr

    return {
      resource: createResourceForTrack(ffmpeg.stdout as Readable, track, {
        inputType: StreamType.OggOpus,
      }),
    };
  }

  if (!track.url) {
    throw new Error('Track URL is required for seek');
  }

  // Streams: play-dl supports seek option
  try {
    const streamInfo = await play.stream(track.url, {
      quality: 2,
      seek: seekSeconds,
    });
    return {
      resource: createResourceForTrack(streamInfo.stream, track, { inputType: streamInfo.type }),
      actualSeek: seekSeconds,
    };
  } catch (error) {
    const err = error as Error;
    log.error(`Failed to stream with seek for ${track.title}: ${err.message}`);
    // Fall back to streaming from start
    const streamInfo = await play.stream(track.url, { quality: 2 });
    return {
      resource: createResourceForTrack(streamInfo.stream, track, { inputType: streamInfo.type }),
      actualSeek: 0,
    };
  }
}
