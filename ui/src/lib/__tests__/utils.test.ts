import { describe, expect, it } from 'vitest';
import { formatDuration, formatDurationLong, formatSessionDuration } from '../utils';

/**
 * `formatDuration` had no hour carry: it printed `Math.floor(seconds / 60)`
 * minutes unbounded, so an hour-long track read `61:01` instead of `1:01:01`,
 * and a two-hour one `122:05`. It also never floored the seconds remainder, so a
 * fractional input leaked the fraction into the output (`212.5` → `3:32.5`), and
 * a negative input produced the nonsense `-1:-30` because `%` keeps the sign.
 *
 * `formatDurationLong` was a byte-for-byte copy apart from its `'-'` fallback,
 * so "Long" never produced hours either. The two now share one implementation
 * and differ only in what they print for an absent/invalid value: `formatDuration`
 * keeps `'0:00'` (its callers render it in a fixed-width meta line) and
 * `formatDurationLong` keeps `'-'` (its caller is a table cell).
 */
describe('formatDuration', () => {
  const cases: Array<[number | null | undefined, string]> = [
    [0, '0:00'],
    [5, '0:05'],
    [59, '0:59'],
    [59.4, '0:59'],
    [60, '1:00'],
    [212.5, '3:32'],
    [245, '4:05'],
    [3599, '59:59'],
    [3600, '1:00:00'],
    [3661, '1:01:01'],
    [7325, '2:02:05'],
    [86399, '23:59:59'],
    [90000, '25:00:00'],
    [-30, '0:00'],
    [Number.NaN, '0:00'],
    [Number.POSITIVE_INFINITY, '0:00'],
    [undefined, '0:00'],
    [null, '0:00'],
  ];

  it.each(cases)('formats %p as %p', (input, expected) => {
    expect(formatDuration(input)).toBe(expected);
  });

  it('carries whole hours rather than printing unbounded minutes', () => {
    expect(formatDuration(3661)).toBe('1:01:01');
    expect(formatDuration(7325)).toBe('2:02:05');
  });
});

describe('formatDurationLong', () => {
  it('produces hours, like formatDuration', () => {
    expect(formatDurationLong(3661)).toBe('1:01:01');
    expect(formatDurationLong(7325)).toBe('2:02:05');
  });

  it('floors fractional seconds', () => {
    expect(formatDurationLong(212.5)).toBe('3:32');
  });

  it.each([[undefined], [null], [Number.NaN], [Number.POSITIVE_INFINITY], [-30]])(
    'falls back to a dash for %p',
    (input) => {
      expect(formatDurationLong(input as number | null | undefined)).toBe('-');
    }
  );
});

/**
 * `formatSessionDuration` replaces a helper that was duplicated verbatim in
 * `SessionsStats` and `UserSessionsStats`. Both copies printed `${minutes}m`
 * whenever `hours === 0`, so every session shorter than a minute rendered `0m`
 * — indistinguishable from a session that did not happen — and every sub-hour
 * duration silently dropped its seconds remainder.
 */
describe('formatSessionDuration', () => {
  const cases: Array<[number | null | undefined, string]> = [
    [0, '0s'],
    [1, '1s'],
    [45, '45s'],
    [59, '59s'],
    [60, '1m'],
    [90, '1m 30s'],
    [599, '9m 59s'],
    [3599, '59m 59s'],
    [3600, '1h 0m'],
    [3659, '1h 0m'],
    [7205, '2h 0m'],
    [7325, '2h 2m'],
    [-30, '0s'],
    [Number.NaN, '0s'],
    [undefined, '0s'],
    [null, '0s'],
  ];

  it.each(cases)('formats %p as %p', (input, expected) => {
    expect(formatSessionDuration(input)).toBe(expected);
  });

  it('never renders a sub-minute session as 0m', () => {
    for (const seconds of [1, 30, 45, 59]) {
      expect(formatSessionDuration(seconds)).not.toBe('0m');
    }
  });
});
