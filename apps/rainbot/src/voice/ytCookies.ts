/**
 * Fetches YouTube cookies from raincloud (if configured via UI) and sets
 * process.env.YTDLP_COOKIES so yt-dlp can use them. Run at startup.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import play from 'play-dl';
import { createLogger } from '@rainbot/shared';
import { getOrchestratorBaseUrl } from '@rainbot/worker-shared';

const log = createLogger('RAINBOT-COOKIES');

const CACHE_FILE_NAME = 'rainbot_yt_cookies.txt';

/** Cookies expire, and the dashboard can replace them at any time. */
const REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000;

/** Path of the cookie file this module wrote, so refreshes can replace it. */
let managedCookiesPath: string | null = null;

/** Netscape cookie jars mark host-only entries with this prefix, not a comment. */
const HTTP_ONLY_PREFIX = '#HttpOnly_';

/** Netscape rows are domain, flag, path, secure, expiry, name, value. */
const NETSCAPE_FIELD_COUNT = 7;

function isYouTubeDomain(domain: string): boolean {
  const host = domain.startsWith('.') ? domain.slice(1) : domain;
  return host === 'youtube.com' || host.endsWith('.youtube.com');
}

/**
 * Convert a Netscape cookie jar (what yt-dlp's --cookies wants) into the
 * `name=value; ...` header play-dl's setToken wants. Only youtube.com entries
 * go in; play-dl sends this header to YouTube alone.
 */
export function netscapeCookiesToHeader(text: string): string {
  const pairs: string[] = [];
  const seen = new Set<string>();

  for (const rawLine of text.split('\n')) {
    let line = rawLine.trim();
    if (!line) continue;

    if (line.startsWith(HTTP_ONLY_PREFIX)) {
      line = line.slice(HTTP_ONLY_PREFIX.length);
    } else if (line.startsWith('#')) {
      continue;
    }

    const fields = line.split('\t');
    if (fields.length < NETSCAPE_FIELD_COUNT) continue;
    if (!isYouTubeDomain(fields[0] ?? '')) continue;

    const name = (fields[5] ?? '').trim();
    if (!name || seen.has(name)) continue;

    seen.add(name);
    pairs.push(`${name}=${(fields[6] ?? '').trim()}`);
  }

  return pairs.join('; ');
}

/**
 * play-dl is the last fallback when yt-dlp fails, but it reads none of the
 * yt-dlp cookie flags — unauthenticated it just returns "Sign in to confirm
 * you're not a bot", which made the fallback chain one tier deep.
 */
async function applyPlayDlCookies(cookiesText: string): Promise<void> {
  const cookie = netscapeCookiesToHeader(cookiesText);
  if (!cookie) {
    log.warn('No youtube.com cookies in jar; play-dl fallback stays unauthenticated');
    return;
  }

  try {
    await play.setToken({ youtube: { cookie } });
    log.info('YouTube cookies applied to play-dl fallback');
  } catch (error) {
    const err = error as Error;
    log.warn(`Failed to apply cookies to play-dl: ${err.message}`);
  }
}

/**
 * Fetch cookies from raincloud internal API and write to a temp file.
 * Sets process.env.YTDLP_COOKIES to the file path on success.
 * Safe to call multiple times; updates the cache when cookies exist.
 */
export async function fetchAndSetYtCookies(): Promise<void> {
  const raincloudUrl = process.env['RAINCLOUD_URL'];
  const workerSecret = process.env['WORKER_SECRET'];

  // YTDLP_COOKIES env takes precedence (manual config), but a file this module
  // wrote earlier must not block a refresh.
  const configuredCookies = process.env['YTDLP_COOKIES'];
  if (configuredCookies && configuredCookies !== managedCookiesPath) {
    log.debug('YTDLP_COOKIES already set, skipping fetch');
    return;
  }

  if (!raincloudUrl || !workerSecret) {
    log.debug('RAINCLOUD_URL or WORKER_SECRET not set, skipping cookie fetch');
    return;
  }

  // RAINCLOUD_URL is host-only on Railway ("raincloud.railway.internal"), which
  // fetch rejects as a relative URL. Reuse the same normalization (scheme +
  // port) that worker registration and stats reporting already go through.
  const baseUrl = getOrchestratorBaseUrl(raincloudUrl);
  if (!baseUrl) {
    log.debug('RAINCLOUD_URL could not be resolved, skipping cookie fetch');
    return;
  }
  const url = `${baseUrl}/internal/cookies/youtube`;

  try {
    const res = await fetch(url, {
      headers: { 'x-worker-secret': workerSecret },
    });

    if (res.status === 404) {
      log.debug('No YouTube cookies configured in raincloud');
      return;
    }

    if (!res.ok) {
      log.warn(`Cookie fetch failed: ${res.status} ${res.statusText}`);
      return;
    }

    const body = await res.text();
    if (!body || body.trim().length === 0) {
      log.warn('Empty cookie response from raincloud');
      return;
    }

    const tmpDir = os.tmpdir();
    const cookiesPath = path.join(tmpDir, CACHE_FILE_NAME);
    fs.writeFileSync(cookiesPath, body, 'utf8');
    managedCookiesPath = cookiesPath;
    process.env['YTDLP_COOKIES'] = cookiesPath;
    log.info('YouTube cookies loaded from raincloud');

    await applyPlayDlCookies(body);
  } catch (error) {
    const err = error as Error;
    log.warn(`Failed to fetch YouTube cookies: ${err.message}`);
  }
}

/**
 * Re-fetch cookies periodically. Without this, cookies uploaded through the
 * dashboard only reach this worker on its next restart.
 */
export function startYtCookieRefresh(intervalMs: number = REFRESH_INTERVAL_MS): NodeJS.Timeout {
  const timer = setInterval(() => {
    void fetchAndSetYtCookies();
  }, intervalMs);
  timer.unref();
  return timer;
}
