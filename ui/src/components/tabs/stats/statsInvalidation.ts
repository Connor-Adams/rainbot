import type { QueryClient } from '@tanstack/react-query';

/**
 * Which Statistics sections a `stats-update` event can actually have changed.
 *
 * The server's `stats-update` payload is `{ type, table, count, ts }`
 * (`statsEmitter.emit('batchInserted', …)` in
 * `packages/utils/src/statistics.ts`), where `type` is the buffer that was just
 * flushed. That `type` is a real discriminator, so `StatsSSE` does not have to
 * mark all 21 stats queries stale on every insert — it can invalidate only the
 * sections whose SQL tables the insert actually touched.
 *
 * Each entry is derived from the tables the matching
 * `apps/raincloud/server/routes/stats.ts` route reads:
 *
 * - `commands` → `command_stats`, which `/summary`, `/commands`, `/users`,
 *   `/guilds`, `/time`, `/errors`, `/performance` and `/retention` all read.
 * - `sounds` → `sound_stats`, read by `/summary`, `/sounds`, `/users`,
 *   `/guilds` and `/time`. `history` rides along because `listening_history` is
 *   written by `trackPlayed`/`saveHistory` on the same playback paths that
 *   record a sound stat — that table is not batch-flushed, so this is the only
 *   event indicating it changed.
 * - `voice` → `voice_events`, which no dashboard section reads; `sessions` is
 *   listed because `voice_sessions` is written directly by `endVoiceSession`
 *   during the same join/leave lifecycle that records a voice event.
 * - everything else maps one-to-one onto its own section.
 *
 * A `type` that is missing or not listed here falls back to invalidating all of
 * `['stats']`, so a new server-side buffer cannot silently stop refreshing the
 * dashboard.
 */
export const STATS_SECTIONS_BY_EVENT_TYPE: Readonly<Record<string, readonly string[]>> = {
  commands: [
    'summary',
    'commands',
    'users',
    'guilds',
    'time',
    'errors',
    'performance',
    'retention',
  ],
  sounds: ['summary', 'sounds', 'users', 'guilds', 'time', 'history'],
  queue: ['queue'],
  voice: ['sessions'],
  search: ['search'],
  userSessions: ['user-sessions', 'sessions'],
  userTrackListens: ['user-tracks'],
  trackEngagement: ['engagement'],
  interactionEvents: ['interactions'],
  playbackStateChanges: ['playback-states'],
  webEvents: ['web-analytics'],
  guildEvents: ['guild-events'],
  apiLatency: ['api-latency'],
};

/** Mark every stats section stale — used when an event names no section. */
export function invalidateAllStats(qc: QueryClient): void {
  qc.invalidateQueries({ queryKey: ['stats'] });
}

/**
 * Invalidate only the sections a `stats-update` payload implicates.
 *
 * `raw` is the event's `data` string. Anything that does not parse, or that
 * names a `type` this client does not know, invalidates everything rather than
 * guessing at a narrowing the server has not described.
 */
export function invalidateForStatsUpdate(qc: QueryClient, raw: string): void {
  let type: unknown;
  try {
    type = (JSON.parse(raw) as { type?: unknown }).type;
  } catch {
    invalidateAllStats(qc);
    return;
  }

  const sections = typeof type === 'string' ? STATS_SECTIONS_BY_EVENT_TYPE[type] : undefined;
  if (!sections) {
    invalidateAllStats(qc);
    return;
  }

  // A known type mapping to no sections would correctly invalidate nothing.
  for (const section of sections) {
    // Prefix match: `history` is keyed `['stats','history',guildId,…]`, so the
    // two-element key covers every filter variant of it.
    qc.invalidateQueries({ queryKey: ['stats', section] });
  }
}
