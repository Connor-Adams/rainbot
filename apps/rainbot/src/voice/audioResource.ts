import { createAudioResource, StreamType, AudioResource } from '@discordjs/voice';
import play from 'play-dl';
import youtubedlPkg from 'youtube-dl-exec';
import { Readable } from 'stream';
import type { Track } from '@rainbot/protocol';
import { createLogger } from '@rainbot/shared';
import {
  withSpan,
  recordTrackResolve,
  recordTrackResolveFailure,
  RainbotAttr,
} from '@rainbot/observability/node';

// Use system yt-dlp if available, otherwise fall back to bundled.
const youtubedl = youtubedlPkg.create(process.env['YTDLP_PATH'] || 'yt-dlp');
const log = createLogger('RAINBOT-AUDIO');

/**
 * yt-dlp options for YouTube. Pipe avoids 403 from direct URL fetch.
 * Reads YTDLP_COOKIES at call time so cookies fetched from raincloud can be used.
 * Exported for use in trackFetcher metadata fallback.
 */
export function getYtdlpOptions(): Record<string, unknown> {
  const options: Record<string, unknown> = {
    noPlaylist: true,
    // Warnings stay on: they are the only signal that a JS runtime or
    // extraction component is missing, and --no-warnings hid exactly that for
    // months while playback failed with an unrelated-looking error.
    quiet: true,
    noCheckCertificates: true,
    // yt-dlp enables only deno by default and calls YouTube extraction without
    // a JS runtime deprecated ("some formats may be missing"). Node is already
    // in the image, so point yt-dlp at it rather than shipping a second
    // runtime.
    jsRuntimes: process.env['YTDLP_JS_RUNTIME'] || 'node',
  };

  // No player_client override by default. A pinned list rots: tv_embedded is
  // age-gate-only and android/ios are PO-token gated, so that set returned no
  // audio-only formats at all and yt-dlp failed with "Requested format is not
  // available". yt-dlp's own default client list tracks YouTube's changes.
  // YTDLP_EXTRACTOR_ARGS stays available to pin clients around a regression.
  const pinnedArgs = process.env['YTDLP_EXTRACTOR_ARGS']?.trim() || '';
  if (pinnedArgs) {
    options['extractorArgs'] = pinnedArgs;
  }

  const cookiesPath = process.env['YTDLP_COOKIES'] || '';
  if (cookiesPath) {
    options['cookies'] = cookiesPath;
  }

  // Set from the dashboard via ytProxy. YouTube refuses Railway's datacenter
  // ranges outright - no client or PO token changes that - so the proxy is what
  // makes a cookie-less request possible at all.
  const proxy = process.env['YTDLP_PROXY']?.trim() || '';
  if (proxy) {
    options['proxy'] = proxy;
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

/**
 * `resolutionPath` names which of createTrackResourceForAny's branches produced
 * this resource, so a span's presence doesn't need to be paired with the
 * absence of a pipe/async span to know a fallback engaged — the attribute
 * says so directly.
 */
async function createVolumeResource(
  input: Readable | string,
  options: { inputType?: StreamType } = {},
  spanAttrs: { trackSource: string; resolutionPath: string }
): Promise<AudioResource> {
  return withSpan(
    'audio.resource.create',
    {
      [RainbotAttr.streamType]: options.inputType ?? 'unknown',
      [RainbotAttr.transcoded]: options.inputType === StreamType.Arbitrary,
      [RainbotAttr.trackSource]: spanAttrs.trackSource,
      [RainbotAttr.resolutionPath]: spanAttrs.resolutionPath,
    },
    async () => createAudioResource(input, { ...options, inlineVolume: true })
  );
}

/**
 * Shared failure vocabulary for `RainbotAttr.outcome` on a track-resolve
 * failure, used by every yt-dlp call site (pipe, get-url, metadata) so a
 * single Grafana breakdown reads as one thing instead of three. `error.name`
 * on a youtube-dl-exec rejection is almost always the literal string "Error"
 * — it discards the one thing that actually says what happened: exit code or
 * stderr. Priority, most to least specific:
 *   1. a recognised stderr/message pattern — 'bot_check' | 'video_unavailable'
 *      | 'network_error' (bot checks and IP/network refusals are exactly the
 *      yt-dlp rot docs/YOUTUBE_403_FIX.md describes)
 *   2. 'stream_closed' — the child was killed by signal (tinyspawn/Node sets
 *      `exitCode: null`, `signalCode: '<SIG>'` in that case). On the pipe path
 *      this means something closed the pipe deliberately — most commonly
 *      @discordjs/voice destroying the play stream on /skip or /stop, which
 *      breaks the pipe and kills yt-dlp via EPIPE/SIGPIPE — not yt-dlp
 *      failing. See createTrackResourcePipe for why this outcome is not
 *      counted as a resolve failure.
 *   3. `exit_<code>` — a numeric non-zero exit code with no recognised
 *      pattern. tinyspawn's rejection (createChildProcessError) does copy
 *      `stdout`/`stderr` onto the error, so this branch doesn't mean stderr
 *      is unavailable — only that nothing above matched it.
 *   4. 'spawn_error' — the yt-dlp binary itself could not be spawned (ENOENT)
 *   5. `error.name` — last resort, for a genuinely unclassified error
 *   6. 'unknown' — not even an Error instance
 */
export function classifyYtdlpFailure(error: unknown): string {
  if (error && typeof error === 'object') {
    const err = error as {
      exitCode?: unknown;
      code?: unknown;
      signalCode?: unknown;
      stderr?: unknown;
      message?: unknown;
      name?: unknown;
    };
    const haystack = [err.stderr, err.message]
      .filter((value): value is string => typeof value === 'string')
      .join('\n');

    if (/sign in to confirm|not a bot|login_required/i.test(haystack)) {
      return 'bot_check';
    }
    if (/video (is )?unavailable|this video is (private|unavailable)/i.test(haystack)) {
      return 'video_unavailable';
    }
    if (/ETIMEDOUT|ECONNRESET|ENOTFOUND|EAI_AGAIN|network error/i.test(haystack)) {
      return 'network_error';
    }
    if (typeof err.signalCode === 'string' && err.signalCode) {
      return 'stream_closed';
    }
    if (typeof err.exitCode === 'number' && err.exitCode !== 0) {
      return `exit_${err.exitCode}`;
    }
    if (err.code === 'ENOENT') {
      return 'spawn_error';
    }
    if (typeof err.name === 'string' && err.name) {
      return err.name;
    }
  }
  return error instanceof Error ? error.name : 'unknown';
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

  const resolveAttrs = {
    [RainbotAttr.trackUrl]: videoUrl,
    [RainbotAttr.trackSource]: 'youtube',
    [RainbotAttr.extractionPath]: 'get-url',
    [RainbotAttr.proxyUsed]: Boolean(process.env['YTDLP_PROXY']),
  };
  const started = Date.now();
  let result: unknown;
  try {
    result = await withSpan('track.resolve', resolveAttrs, () => youtubedl(videoUrl, options));
    recordTrackResolve(Date.now() - started, {
      [RainbotAttr.trackSource]: 'youtube',
      [RainbotAttr.extractionPath]: 'get-url',
    });
  } catch (error) {
    recordTrackResolveFailure({
      [RainbotAttr.trackSource]: 'youtube',
      [RainbotAttr.extractionPath]: 'get-url',
      [RainbotAttr.outcome]: classifyYtdlpFailure(error),
    });
    throw error;
  }

  const streamUrl = (result as string).trim();

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
      return await withSpan(
        'audio.resource.create',
        {
          [RainbotAttr.streamType]: StreamType.Arbitrary,
          [RainbotAttr.transcoded]: true,
          [RainbotAttr.trackSource]: track.sourceType ?? 'unknown',
          [RainbotAttr.resolutionPath]: 'yt-dlp-async-fetch',
        },
        async () =>
          createAudioResource(nodeStream, {
            inputType: StreamType.Arbitrary,
            inlineVolume: true,
          })
      );
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
    // Match getStreamUrl: /best fallback when opus-only / pure bestaudio aren't exposed for this video.
    // Omit preferFreeFormats — it can narrow formats until nothing matches (pipe then errors while get-url works).
    format: 'bestaudio[acodec=opus]/bestaudio/best',
    output: '-',
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

  const resolveAttrs = {
    [RainbotAttr.trackSource]: 'youtube',
    [RainbotAttr.extractionPath]: 'pipe',
  };

  // Time to first stdout byte is the real resolve latency for this path — it
  // moves with actual yt-dlp health (extraction retries, slow format
  // negotiation), unlike PIPE_START_TIMEOUT_MS below, which is a fixed
  // fallback deadline and must stay constant regardless of how fast yt-dlp
  // actually is. Captured independently of the race so a byte that arrives
  // before the race resolves is still timed correctly.
  let firstByteAt: number | null = null;
  subprocess.stdout?.once('data', () => {
    firstByteAt ??= Date.now();
  });

  // No exception crosses this boundary on failure — a dead-on-arrival or
  // erroring subprocess resolves to 'exited'/'failed' rather than rejecting,
  // so withSpan (which only reacts to a thrown/rejected fn) would see this as
  // a clean, unremarkable return. Record resolve outcome directly instead of
  // relying on withSpan's exception-based error detection.
  const started = Date.now();
  const raceResult = await Promise.race([
    subprocess
      .then(() => ({ kind: 'exited' as const }))
      .catch((err: unknown) => ({ kind: 'failed' as const, err })),
    new Promise<{ kind: 'timeout' }>((resolve) =>
      setTimeout(() => resolve({ kind: 'timeout' }), PIPE_START_TIMEOUT_MS)
    ),
  ]);

  if (raceResult.kind !== 'timeout') {
    log.debug(`yt-dlp pipe ${raceResult.kind} within ${PIPE_START_TIMEOUT_MS}ms, will fallback`);
    recordTrackResolveFailure({
      ...resolveAttrs,
      [RainbotAttr.outcome]:
        raceResult.kind === 'exited' ? 'exited' : classifyYtdlpFailure(raceResult.err),
    });
    return null;
  }

  // Subprocess is still alive past the start window, so this function will
  // return it as the resource: record the real resolve duration now (or as
  // soon as the first byte actually arrives, if it hasn't yet), and keep
  // listening for a later failure. A yt-dlp process that dies mid-stream
  // after this point — network retry exhausted, extraction fallback failed —
  // is exactly what rot looks like, and must still increment the failure
  // counter even though this function is about to return a "successful"
  // resource. This can never double-count against the recordTrackResolveFailure
  // call above: that branch only runs when the subprocess promise has already
  // settled, which is mutually exclusive with reaching this point.
  if (firstByteAt !== null) {
    recordTrackResolve(firstByteAt - started, resolveAttrs);
  } else {
    subprocess.stdout?.once('data', () => {
      recordTrackResolve((firstByteAt ?? Date.now()) - started, resolveAttrs);
    });
  }
  subprocess.catch((err: unknown) => {
    try {
      const outcome = classifyYtdlpFailure(err);
      // A user /skip or /stop makes @discordjs/voice destroy the play stream
      // (subprocess.stdout), which breaks the pipe and kills yt-dlp via
      // EPIPE/signal — that is normal, deliberate shutdown, not yt-dlp rot.
      // Counting it here would make rainbot.track.resolve.failures dominated
      // by ordinary skips instead of tracking real yt-dlp health, so it's
      // logged but not recorded as a resolve failure.
      if (outcome === 'stream_closed') {
        log.debug(`yt-dlp pipe closed after start window (deliberate stream close)`);
        return;
      }
      recordTrackResolveFailure({
        ...resolveAttrs,
        [RainbotAttr.outcome]: outcome,
      });
    } catch (telemetryError) {
      log.debug(`telemetry recordTrackResolveFailure threw: ${telemetryError}`);
    }
  });

  return withSpan(
    'audio.resource.create',
    {
      [RainbotAttr.streamType]: StreamType.Arbitrary,
      [RainbotAttr.transcoded]: true,
      [RainbotAttr.trackSource]: track.sourceType ?? 'unknown',
      [RainbotAttr.resolutionPath]: 'yt-dlp-pipe',
    },
    async () =>
      createAudioResource(subprocess.stdout as Readable, {
        inputType: StreamType.Arbitrary,
        inlineVolume: true,
      })
  );
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
    return createVolumeResource(
      streamInfo.stream,
      { inputType: streamInfo.type },
      { trackSource: track.sourceType ?? 'unknown', resolutionPath: 'play-dl-fallback' }
    );
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
    return createVolumeResource(
      streamInfo.stream,
      { inputType: streamInfo.type },
      { trackSource: track.sourceType ?? 'unknown', resolutionPath: 'play-dl-direct' }
    );
  }

  throw new Error('URL no longer valid');
}
