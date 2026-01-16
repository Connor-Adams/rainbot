import { createAudioResource, StreamType, AudioResource } from '@discordjs/voice';
import play from 'play-dl';
import youtubedlPkg from 'youtube-dl-exec';
import { Readable } from 'stream';
import type { Track } from '@rainbot/protocol';

// Use system yt-dlp if available, otherwise fall back to bundled.
const youtubedl = youtubedlPkg.create(process.env['YTDLP_PATH'] || 'yt-dlp');
const COOKIES_FILE = process.env['YTDLP_COOKIES'] || '';

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

async function getStreamUrl(videoUrl: string): Promise<string> {
  const cached = urlCache.get(videoUrl);
  if (cached && cached.expires > Date.now()) {
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
    if (oldestKey) urlCache.delete(oldestKey);
  }

  urlCache.set(videoUrl, { url: streamUrl, expires: Date.now() + CACHE_EXPIRATION_MS });
  return streamUrl;
}

async function createTrackResourceAsync(track: Track): Promise<AudioResource | null> {
  if (!track.url) return null;
  const ytMatch = track.url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  if (!ytMatch) return null;

  try {
    console.log(`[RAINBOT] stream async (yt-dlp url) title="${track.title}" url="${track.url}"`);
    const streamUrl = await getStreamUrl(track.url);
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

      console.log(`[RAINBOT] stream async ok url="${track.url}"`);
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
      console.warn(`[RAINBOT] stream async failed, will fallback: ${err.message}`);
      return null;
    }
    throw error;
  }
}

function createTrackResource(track: Track): AudioResource | null {
  if (!track.url) return null;

  const ytMatch = track.url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  if (!ytMatch) return null;

  console.log(`[RAINBOT] stream yt-dlp pipe title="${track.title}" url="${track.url}"`);
  const subprocess = youtubedl.exec(track.url, {
    ...getYtdlpOptions(),
    format: 'bestaudio[acodec=opus]/bestaudio',
    output: '-',
    preferFreeFormats: true,
    bufferSize: '16K',
  });

  subprocess.catch(() => {});
  subprocess.stderr?.on('data', () => {});
  subprocess.stdout?.on('error', () => {});

  return createAudioResource(subprocess.stdout as Readable, {
    inputType: StreamType.Arbitrary,
    inlineVolume: true,
  });
}

export async function createTrackResourceForAny(track: Track): Promise<AudioResource> {
  if (track.isLocal) {
    throw new Error('Local tracks are not supported in the rainbot worker');
  }

  if (!track.url) {
    console.warn(
      `[RAINBOT] stream skipped (missing url) title="${track.title}" sourceType=${track.sourceType || 'n/a'}`
    );
    throw new Error('Track URL is required');
  }

  const ytMatch = track.url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  console.log(
    `[RAINBOT] stream start title="${track.title}" url="${track.url}" sourceType=${track.sourceType || 'n/a'}`
  );
  if (ytMatch) {
    try {
      const asyncResource = await createTrackResourceAsync(track);
      if (asyncResource) return asyncResource;
    } catch (error) {
      const err = error as Error;
      console.warn(`[RAINBOT] stream async failed: ${err.message}`);
    }

    try {
      const fallback = createTrackResource(track);
      if (fallback) return fallback;
    } catch (error) {
      const err = error as Error;
      console.warn(`[RAINBOT] stream yt-dlp pipe failed: ${err.message}`);
    }

    console.log(`[RAINBOT] stream play-dl fallback title="${track.title}" url="${track.url}"`);
    const streamInfo = await play.stream(track.url, { quality: 2 });
    return createVolumeResource(streamInfo.stream, { inputType: streamInfo.type });
  }

  const urlType = await play.validate(track.url);
  console.log(
    `[RAINBOT] stream validate urlType=${urlType || 'unknown'} title="${track.title}" url="${track.url}"`
  );
  if (urlType) {
    console.log(
      `[RAINBOT] stream play-dl non-youtube type=${urlType} title="${track.title}" url="${track.url}"`
    );
    const streamInfo = await play.stream(track.url, { quality: 2 });
    return createVolumeResource(streamInfo.stream, { inputType: streamInfo.type });
  }

  throw new Error('URL no longer valid');
}
