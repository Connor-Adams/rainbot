// Utility functions

export function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

/**
 * Whole, non-negative seconds, or `null` for anything that cannot be a length.
 *
 * Every duration helper below starts here because the old ones did the
 * arithmetic first and let it produce nonsense: `seconds % 60` keeps the sign,
 * so `-30` printed `-1:-30`, and it does not floor, so a fractional value
 * (`durationMs / 1000`, `AVG(...)` from Postgres) leaked its fraction straight
 * into the output as `3:32.5`. `NaN`/`Infinity` printed `Infinity:NaN`.
 */
function wholeSeconds(seconds: number | null | undefined): number | null {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return null;
  return Math.floor(seconds);
}

/**
 * `H:MM:SS` once there is at least one whole hour, `M:SS` below that.
 *
 * The hour carry is the whole point: both public formatters used to print
 * `Math.floor(seconds / 60)` minutes unbounded, so an hour-long track read
 * `61:01` and a two-hour one `122:05`. Minutes are padded to two digits only
 * when hours precede them, so short durations keep the familiar `4:05` shape
 * rather than becoming `04:05`.
 */
function clock(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const paddedSeconds = seconds.toString().padStart(2, '0');

  if (hours > 0) return `${hours}:${minutes.toString().padStart(2, '0')}:${paddedSeconds}`;
  return `${minutes}:${paddedSeconds}`;
}

/**
 * Track length for a fixed-width meta line (`QueueItem`). An absent or
 * impossible value reads `0:00`, which is what this function has always
 * returned for one — its caller already suppresses the whole element rather
 * than rendering a length it does not know.
 */
export function formatDuration(seconds: number | null | undefined): string {
  const total = wholeSeconds(seconds);
  if (total === null) return '0:00';
  return clock(total);
}

/**
 * Same clock, dash fallback. Only the fallback ever differed between this and
 * `formatDuration` — they were otherwise byte-identical, which is why "Long"
 * never produced hours either. Its caller is a table cell, where `-` reads as
 * "not recorded" and `0:00` would claim the length is known to be zero.
 */
export function formatDurationLong(seconds: number | null | undefined): string {
  const total = wholeSeconds(seconds);
  if (total === null) return '-';
  return clock(total);
}

/**
 * Elapsed time for a voice session, in the coarse `2h 5m` / `9m 30s` / `45s`
 * shape the Statistics tab uses — a different job from `formatDuration`'s clock,
 * which is why it is a separate formatter rather than a flag on that one.
 *
 * It replaces a helper that was duplicated verbatim in `SessionsStats` and
 * `UserSessionsStats`. Both copies fell through to `${minutes}m` whenever
 * `hours === 0`, so every session shorter than a minute rendered `0m` —
 * indistinguishable from one that never happened — and every sub-hour duration
 * dropped its seconds remainder entirely.
 *
 * The unit shown is always the smallest one present, so nothing vanishes:
 * seconds appear below an hour, and are omitted above it where they are under
 * 1.7% of the value and would only add noise.
 */
export function formatSessionDuration(seconds: number | null | undefined): string {
  const total = wholeSeconds(seconds);
  if (total === null) return '0s';

  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remainingSeconds = total % 60;

  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
  return `${remainingSeconds}s`;
}
