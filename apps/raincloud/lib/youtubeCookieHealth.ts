import { createHash } from 'crypto';
import * as storage from '@rainbot/utils/storage';

/**
 * Whether YouTube still accepts the cookies uploaded in the dashboard, as last
 * reported by the rainbot worker (yt-dlp warns "cookies are no longer valid"
 * when YouTube rotates the session out).
 *
 * A report names the jar it is about by hash, and only counts while that jar
 * is still the stored one: a worker can keep using an old jar for hours after
 * an upload, and its reports must not flag the new one. Held in memory — the
 * warning repeats on every yt-dlp run, so a raincloud restart loses at most
 * one track's worth of signal.
 */

let staleReport: { hash: string; reportedAt: Date } | null = null;

/** Hash of the stored jar; undefined until read, null when none is stored. */
let storedHash: string | null | undefined;

async function getStoredHash(): Promise<string | null> {
  if (storedHash === undefined) {
    const buf = await storage.getYoutubeCookies();
    storedHash = buf ? createHash('sha256').update(buf).digest('hex') : null;
  }
  return storedHash;
}

export function reportStaleCookies(hash: string, now: Date = new Date()): void {
  // Keep the first report for a jar: "stale since" is when it started failing.
  if (staleReport?.hash === hash) return;
  staleReport = { hash, reportedAt: now };
}

/** Call whenever the stored jar is uploaded or removed. */
export function onCookiesChanged(): void {
  storedHash = undefined;
  staleReport = null;
}

export async function getCookieHealth(): Promise<{ stale: boolean; staleSince: string | null }> {
  if (!staleReport) return { stale: false, staleSince: null };
  const hash = await getStoredHash();
  if (hash !== staleReport.hash) return { stale: false, staleSince: null };
  return { stale: true, staleSince: staleReport.reportedAt.toISOString() };
}
