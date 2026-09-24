/**
 * Fetches the outbound proxy URL from raincloud (set through the dashboard) and
 * publishes it as process.env.YTDLP_PROXY for yt-dlp.
 *
 * YouTube blocks the datacenter ranges Railway runs in, so every request is
 * refused with "Sign in to confirm you're not a bot" regardless of client or PO
 * token. Routing yt-dlp through a proxy is what changes that.
 */
import { createLogger } from '@rainbot/shared';
import { normalizeProxyUrl, maskProxyUrl } from '@rainbot/shared';
import { getOrchestratorBaseUrl } from '@rainbot/worker-shared';

const log = createLogger('RAINBOT-PROXY');

/** The dashboard can change the proxy at any time. */
const REFRESH_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Fetch the proxy from raincloud and publish it to the environment.
 *
 * Safe to call repeatedly. A removed proxy clears the variable; a raincloud
 * outage leaves the current value alone, because dropping it would silently
 * send traffic straight out of the blocked datacenter IP.
 */
export async function fetchAndSetYtProxy(): Promise<void> {
  // An operator-set variable wins outright and is never overwritten.
  const override = process.env['YTDLP_PROXY_OVERRIDE']?.trim();
  if (override) {
    if (process.env['YTDLP_PROXY'] !== override) {
      process.env['YTDLP_PROXY'] = override;
      log.info(`Using YTDLP_PROXY_OVERRIDE: ${maskProxyUrl(override)}`);
    }
    return;
  }

  const raincloudUrl = process.env['RAINCLOUD_URL'];
  const workerSecret = process.env['WORKER_SECRET'];
  if (!raincloudUrl || !workerSecret) {
    log.debug('RAINCLOUD_URL or WORKER_SECRET not set, skipping proxy fetch');
    return;
  }

  const baseUrl = getOrchestratorBaseUrl(raincloudUrl);
  if (!baseUrl) {
    log.debug('RAINCLOUD_URL could not be resolved, skipping proxy fetch');
    return;
  }

  try {
    const res = await fetch(`${baseUrl}/internal/proxy/youtube`, {
      headers: { 'x-worker-secret': workerSecret },
    });

    if (res.status === 404) {
      if (process.env['YTDLP_PROXY']) {
        delete process.env['YTDLP_PROXY'];
        log.info('Proxy removed in dashboard; going direct');
      }
      return;
    }

    if (!res.ok) {
      log.warn(`Proxy fetch failed: ${res.status} ${res.statusText}`);
      return;
    }

    const body = (await res.text()).trim();
    if (!body) {
      log.warn('Empty proxy response from raincloud');
      return;
    }

    let proxyUrl: string;
    try {
      // Re-validate here rather than trusting storage: a value written by an
      // older build, or edited out of band, must not reach yt-dlp unchecked.
      proxyUrl = normalizeProxyUrl(body);
    } catch (error) {
      log.warn(`Stored proxy URL is invalid, ignoring it: ${(error as Error).message}`);
      return;
    }

    if (process.env['YTDLP_PROXY'] !== proxyUrl) {
      process.env['YTDLP_PROXY'] = proxyUrl;
      log.info(`YouTube proxy loaded from raincloud: ${maskProxyUrl(proxyUrl)}`);
    }
  } catch (error) {
    const err = error as Error;
    log.warn(`Failed to fetch YouTube proxy: ${err.message}`);
  }
}

/**
 * Re-fetch the proxy periodically, so a dashboard change reaches this worker
 * without a restart.
 */
export function startYtProxyRefresh(intervalMs: number = REFRESH_INTERVAL_MS): NodeJS.Timeout {
  const timer = setInterval(() => {
    void fetchAndSetYtProxy();
  }, intervalMs);
  timer.unref();
  return timer;
}
