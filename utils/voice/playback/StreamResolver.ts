// util-category: audio
import play from 'play-dl';
import youtubedlPkg from 'youtube-dl-exec';
import { Readable } from 'stream';
import { createLogger } from '@utils/logger';
import type { Track } from '@rainbot/types/voice';

const log = createLogger('STREAM_RESOLVER');

// Use system yt-dlp if available
const youtubedl = youtubedlPkg.create(process.env['YTDLP_PATH'] || 'yt-dlp');

// Cookie file path for YouTube authentication
const COOKIES_FILE = process.env['YTDLP_COOKIES'] || '';

// Cache settings
const CACHE_EXPIRATION_MS = 2 * 60 * 60 * 1000;
const MAX_CACHE_SIZE = 500;
const FETCH_TIMEOUT_MS = 10_000;

interface CacheEntry {
  url: string;
  expires: number;
}

const urlCache = new Map<string, CacheEntry>();

const YOUTUBE_REGEX = /(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/;

function getYtdlpOptions(): Record<string, unknown> {
  const options: Record<string, unknown> = {
    noPlaylist: true,
    noWarnings: true,
    quiet: true,
    noCheckCertificates: true,
  };

  if (COOKIES_FILE) {
    options['cookies'] = COOKIES_FILE;
  }

  return options;
}

function isYouTubeUrl(url?: string): boolean {
  return !!url && YOUTUBE_REGEX.test(url);
}

async function getCachedStreamUrl(videoUrl: string): Promise<string> {
  const cached = urlCache.get(videoUrl);
  if (cached && cached.expires > Date.now()) {
    log.debug(`Using cached stream URL`);
    return cached.url;
  }

  const result = (await youtubedl(videoUrl, {
    ...getYtdlpOptions(),
    format: 'bestaudio[acodec=opus]/bestaudio/best',
    getUrl: true,
  })) as unknown as string;

  const streamUrl = result.trim();

  if (urlCache.size >= MAX_CACHE_SIZE) {
    const oldestKey = urlCache.keys().next().value;
    if (oldestKey !== undefined) urlCache.delete(oldestKey);
  }

  urlCache.set(videoUrl, {
    url: streamUrl,
    expires: Date.now() + CACHE_EXPIRATION_MS,
  });

  return streamUrl;
}

async function fetchStream(url: string): Promise<Readable> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
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

    if (!response.ok) {
      throw new Error(`Stream fetch failed: ${response.status}`);
    }

    const nodeStream = Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]);

    nodeStream.on('error', (err) => {
      log.debug(`Readable stream error: ${(err as Error).message}`);
    });

    return nodeStream;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Resolve a Track into a readable audio stream.
 * This function NEVER creates AudioResources.
 */
export async function resolveStream(track: Track, seekSeconds = 0): Promise<Readable> {
  if (!track.url) {
    throw new Error('Track has no URL');
  }

  // YouTube path (fastest + most reliable)
  if (isYouTubeUrl(track.url)) {
    log.debug(`Resolving YouTube stream (seek=${seekSeconds}s)`);

    if (seekSeconds > 0) {
      const result = (await youtubedl(track.url, {
        ...getYtdlpOptions(),
        format: 'bestaudio[acodec=opus]/bestaudio/best',
        getUrl: true,
        downloadSections: `*${seekSeconds}-inf`,
      })) as unknown as string;

      return fetchStream(result.trim());
    }

    const streamUrl = await getCachedStreamUrl(track.url);
    return fetchStream(streamUrl);
  }

  // Fallback: play-dl
  const urlType = await play.validate(track.url);
  if (!urlType) {
    throw new Error('URL no longer valid');
  }

  const streamInfo = await play.stream(track.url, { quality: 2 });
  return streamInfo.stream as Readable;
}
