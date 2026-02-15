/**
 * Fetches YouTube cookies from raincloud (if configured via UI) and sets
 * process.env.YTDLP_COOKIES so yt-dlp can use them. Run at startup.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createLogger } from '@rainbot/shared';

const log = createLogger('RAINBOT-COOKIES');

const CACHE_FILE_NAME = 'rainbot_yt_cookies.txt';

/**
 * Fetch cookies from raincloud internal API and write to a temp file.
 * Sets process.env.YTDLP_COOKIES to the file path on success.
 * Safe to call multiple times; updates the cache when cookies exist.
 */
export async function fetchAndSetYtCookies(): Promise<void> {
  const raincloudUrl = process.env['RAINCLOUD_URL'];
  const workerSecret = process.env['WORKER_SECRET'];

  // YTDLP_COOKIES env takes precedence (manual config)
  if (process.env['YTDLP_COOKIES']) {
    log.debug('YTDLP_COOKIES already set, skipping fetch');
    return;
  }

  if (!raincloudUrl || !workerSecret) {
    log.debug('RAINCLOUD_URL or WORKER_SECRET not set, skipping cookie fetch');
    return;
  }

  const baseUrl = raincloudUrl.replace(/\/$/, '');
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
    process.env['YTDLP_COOKIES'] = cookiesPath;
    log.info('YouTube cookies loaded from raincloud');
  } catch (error) {
    const err = error as Error;
    log.warn(`Failed to fetch YouTube cookies: ${err.message}`);
  }
}
