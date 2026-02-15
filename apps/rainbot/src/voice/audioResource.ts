import { createAudioResource, StreamType, AudioResource } from '@discordjs/voice';
import play from 'play-dl';
import youtubedlPkg from 'youtube-dl-exec';
import { Readable } from 'stream';
import type { Track } from '@rainbot/types/voice';
import { createLogger } from '@rainbot/shared';

// Use system yt-dlp if available, otherwise fall back to bundled.
const youtubedl = youtubedlPkg.create(process.env['YTDLP_PATH'] || 'yt-dlp');
const log = createLogger('RAINBOT-AUDIO');

/**
 * yt-dlp options for YouTube. Multiple player_client fallbacks improve
 * reliability when YouTube changes; pipe avoids 403 from direct URL fetch.
 * Reads YTDLP_COOKIES at call time so cookies fetched from raincloud can be used.
 * Exported for use in trackFetcher metadata fallback.
 */
export function getYtdlpOptions(): Record<string, unknown> {
  // Try clients in order: tv_embedded/android often work without PO token; ios/web as fallback
  const extractorArgs =
    process.env['YTDLP_EXTRACTOR_ARGS'] || 'youtube:player_client=tv_embedded,android,ios,web';
  const options: Record<string, unknown> = {
    noPlaylist: true,
    noWarnings: true,
    quiet: true,
    noCheckCertificates: true,
    extractorArgs,
  };

  const cookiesPath = process.env['YTDLP_COOKIES'] || '';
  if (cookiesPath) {
    options['cookies'] = cookiesPath;
  }

  return options;
}

const CACHE_EXPIRATION_MS = 2 * 60 * 60 * 1000;
const MAX_CACHE_SIZE = 500;
const FETCH_TIMEOUT_MS = 10000;

interface CacheEntry {
  url: string;
  expires: number;
}

const urlCache = new Map<string, CacheEntry>();

function createVolumeResource(
  input: Readable | string,
  options: { inputType?: StreamType } = {}
): AudioResource {
  return createAudioResource(input, { ...options, inlineVolume: true });
}

async function getStreamUrl(videoUrl: string, seekSeconds = 0): Promise<string> {
  const cacheKey = seekSeconds > 0 ? `${videoUrl}#seek=${seekSeconds}` : videoUrl;
  const cached = urlCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) {
    return cached.url;
  }

  const options: Record<string, unknown> = {
    ...getYtdlpOptions(),
    format: 'bestaudio[acodec=opus]/bestaudio/best',
    getUrl: true,
  };
  if (seekSeconds > 0) {
    options['downloadSections'] = `*${seekSeconds}-inf`;
  }

  const result = (await youtubedl(videoUrl, options)) as unknown as string;

  const streamUrl = result.trim();

  if (urlCache.size >= MAX_CACHE_SIZE) {
    const oldestKey = urlCache.keys().next().value;
    if (oldestKey) urlCache.delete(oldestKey);
  }

  urlCache.set(cacheKey, { url: streamUrl, expires: Date.now() + CACHE_EXPIRATION_MS });
  return streamUrl;
}

async function createTrackResourceAsync(
  track: Track,
  seekSeconds = 0
): Promise<AudioResource | null> {
  if (!track.url) return null;
  const ytMatch = track.url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  if (!ytMatch) return null;

  try {
    log.debug(
      `stream async (yt-dlp url) title="${track.title}" url="${track.url}" seek=${seekSeconds}`
    );
    const streamUrl = await getStreamUrl(track.url, seekSeconds);
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
        if (response.status === 403) {
          urlCache.delete(track.url);
        }
        throw new Error(`Stream fetch failed: ${response.status}`);
      }

      const nodeStream = Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]);
      nodeStream.on('error', () => {});

      log.debug(`stream async ok url="${track.url}"`);
      return createAudioResource(nodeStream, {
        inputType: StreamType.Arbitrary,
        inlineVolume: true,
      });
    } catch (fetchError) {
      clearTimeout(timeoutId);
      throw fetchError;
    }
  } catch (error) {
    const err = error as Error;
    if (err.message.includes('Stream fetch failed') || err.message.includes('fetch')) {
      log.warn(`stream async failed, will fallback: ${err.message}`);
      return null;
    }
    throw error;
  }
}

const PIPE_START_TIMEOUT_MS = 4000;

/**
 * Try to create a resource via yt-dlp pipe. If the subprocess fails or exits
 * within the start window, returns null so the caller can fall back to async/play-dl.
 */
async function createTrackResourcePipe(
  track: Track,
  seekSeconds = 0
): Promise<AudioResource | null> {
  if (!track.url) return null;

  const ytMatch = track.url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  if (!ytMatch) return null;

  log.debug(`stream yt-dlp pipe title="${track.title}" url="${track.url}" seek=${seekSeconds}`);
  const pipeOptions: Record<string, unknown> = {
    ...getYtdlpOptions(),
    format: 'bestaudio[acodec=opus]/bestaudio',
    output: '-',
    preferFreeFormats: true,
    bufferSize: '16K',
  };
  if (seekSeconds > 0) {
    pipeOptions['downloadSections'] = `*${seekSeconds}-inf`;
  }
  const subprocess = youtubedl.exec(track.url, pipeOptions);

  subprocess.catch((err: unknown) => {
    log.error(
      `yt-dlp pipe subprocess error for "${track.url}": ${err instanceof Error ? err.message : String(err)}`
    );
    if (err instanceof Error && err.stack) log.debug(err.stack);
  });
  subprocess.stderr?.on('data', (data: Buffer | string) => {
    const text = typeof data === 'string' ? data : data.toString();
    const trimmed = text.trim();
    if (trimmed) log.warn(`yt-dlp stderr: ${trimmed}`);
  });
  subprocess.stdout?.on('error', (err: Error) => {
    log.warn(`yt-dlp pipe stdout error: ${err.message}`);
  });

  const outcome = await Promise.race([
    subprocess.then(() => 'exited' as const).catch(() => 'failed' as const),
    new Promise<'timeout'>((resolve) =>
      setTimeout(() => resolve('timeout'), PIPE_START_TIMEOUT_MS)
    ),
  ]);

  if (outcome !== 'timeout') {
    log.debug(`yt-dlp pipe ${outcome} within ${PIPE_START_TIMEOUT_MS}ms, will fallback`);
    return null;
  }

  return createAudioResource(subprocess.stdout as Readable, {
    inputType: StreamType.Arbitrary,
    inlineVolume: true,
  });
}

export async function createTrackResourceForAny(
  track: Track,
  seekSeconds = 0
): Promise<AudioResource> {
  if (track.isLocal) {
    throw new Error('Local tracks are not supported in the rainbot worker');
  }

  if (!track.url) {
    log.warn(
      `stream skipped (missing url) title="${track.title}" sourceType=${track.sourceType || 'n/a'}`
    );
    throw new Error('Track URL is required');
  }

  const ytMatch = track.url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  log.debug(
    `stream start title="${track.title}" url="${track.url}" sourceType=${track.sourceType || 'n/a'} seek=${seekSeconds}`
  );
  if (ytMatch) {
    // Prefer yt-dlp pipe for YouTube: avoids 403 from direct URL fetch (YouTube often blocks server fetches).
    // Pipe streams via subprocess stdout; no second HTTP fetch, so no 403.
    try {
      const pipeResource = await createTrackResourcePipe(track, seekSeconds);
      if (pipeResource) return pipeResource;
    } catch (error) {
      const err = error as Error;
      log.warn(`stream yt-dlp pipe failed: ${err.message}`);
    }

    try {
      const asyncResource = await createTrackResourceAsync(track, seekSeconds);
      if (asyncResource) return asyncResource;
    } catch (error) {
      const err = error as Error;
      log.warn(`stream async failed: ${err.message}`);
    }

    log.debug(`stream play-dl fallback title="${track.title}" url="${track.url}"`);
    const streamInfo = await play.stream(track.url, {
      quality: 2,
      ...(seekSeconds > 0 ? { seek: seekSeconds } : {}),
    });
    return createVolumeResource(streamInfo.stream, { inputType: streamInfo.type });
  }

  const urlType = await play.validate(track.url);
  log.debug(
    `stream validate urlType=${urlType || 'unknown'} title="${track.title}" url="${track.url}"`
  );
  if (urlType) {
    log.debug(
      `stream play-dl non-youtube type=${urlType} title="${track.title}" url="${track.url}"`
    );
    const streamInfo = await play.stream(track.url, {
      quality: 2,
      ...(seekSeconds > 0 ? { seek: seekSeconds } : {}),
    });
    return createVolumeResource(streamInfo.stream, { inputType: streamInfo.type });
  }

  throw new Error('URL no longer valid');
}
