import { describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { STATS_SECTIONS_BY_EVENT_TYPE, invalidateForStatsUpdate } from '../statsInvalidation';

/**
 * These pin the *narrowing*: a `stats-update` event names the buffer that was
 * flushed, so only the sections reading that buffer's table are invalidated.
 * Before, every event marked all 21 stats queries stale.
 *
 * Assertions are on the `queryKey`s handed to `invalidateQueries`, because that
 * — not the number of requests — is what the blast radius actually is: a stats
 * section that is not mounted has no observer, so invalidating it issues no
 * request now but forces a fresh one the next time the tab is opened.
 */
function spyClient() {
  const qc = new QueryClient();
  const invalidate = vi.spyOn(qc, 'invalidateQueries').mockResolvedValue(undefined);
  return {
    qc,
    /** Every queryKey passed to invalidateQueries, in order. */
    keys: () => invalidate.mock.calls.map((c) => (c[0] as { queryKey: unknown[] }).queryKey),
  };
}

const event = (payload: unknown) => JSON.stringify(payload);

describe('invalidateForStatsUpdate — narrowing by the event discriminator', () => {
  it('invalidates only the queue section for a queue batch', () => {
    const { qc, keys } = spyClient();

    invalidateForStatsUpdate(qc, event({ type: 'queue', table: 'queue_operations', count: 3 }));

    expect(keys()).toEqual([['stats', 'queue']]);
  });

  it('does not touch the other 20 sections for a single-section batch', () => {
    const { qc, keys } = spyClient();

    invalidateForStatsUpdate(qc, event({ type: 'apiLatency', table: 'api_latency', count: 1 }));

    expect(keys()).toEqual([['stats', 'api-latency']]);
    // The blanket key is what the old implementation used; it must not appear.
    expect(keys()).not.toContainEqual(['stats']);
  });

  it('invalidates every section that reads command_stats for a commands batch', () => {
    const { qc, keys } = spyClient();

    invalidateForStatsUpdate(qc, event({ type: 'commands', table: 'command_stats', count: 12 }));

    expect(keys()).toEqual([
      ['stats', 'summary'],
      ['stats', 'commands'],
      ['stats', 'users'],
      ['stats', 'guilds'],
      ['stats', 'time'],
      ['stats', 'errors'],
      ['stats', 'performance'],
      ['stats', 'retention'],
    ]);
  });

  it('includes history for a sounds batch, since listening_history is written on the same path', () => {
    const { qc, keys } = spyClient();

    invalidateForStatsUpdate(qc, event({ type: 'sounds', table: 'sound_stats', count: 2 }));

    expect(keys()).toContainEqual(['stats', 'history']);
    expect(keys()).toContainEqual(['stats', 'sounds']);
  });

  it('uses a 2-element key for history so every filter variant is prefix-matched', () => {
    const qc = new QueryClient();
    const spy = vi.spyOn(qc, 'invalidateQueries').mockResolvedValue(undefined);

    invalidateForStatsUpdate(qc, event({ type: 'sounds' }));

    const historyCall = spy.mock.calls
      .map((c) => (c[0] as { queryKey: unknown[] }).queryKey)
      .find((k) => k[1] === 'history');
    // HistoryStats keys itself ['stats','history',guildId,start,end]; a longer
    // key here would miss every filtered variant.
    expect(historyCall).toHaveLength(2);
  });
});

describe('invalidateForStatsUpdate — conservative fallbacks', () => {
  it('invalidates all stats when the payload names an unknown buffer type', () => {
    const { qc, keys } = spyClient();

    invalidateForStatsUpdate(qc, event({ type: 'somethingTheServerAddedLater', count: 1 }));

    expect(keys()).toEqual([['stats']]);
  });

  it('invalidates all stats when the payload carries no type at all', () => {
    const { qc, keys } = spyClient();

    invalidateForStatsUpdate(qc, event({ count: 1, ts: '2026-01-01T00:00:00.000Z' }));

    expect(keys()).toEqual([['stats']]);
  });

  it('invalidates all stats when the payload is not JSON', () => {
    const { qc, keys } = spyClient();

    invalidateForStatsUpdate(qc, 'not json at all');

    expect(keys()).toEqual([['stats']]);
  });
});

describe('STATS_SECTIONS_BY_EVENT_TYPE', () => {
  it('covers all 13 buffer types the server can flush', () => {
    // packages/utils/src/statistics.ts `BufferType`. A type missing here still
    // works (it falls back to invalidating everything) but loses the narrowing,
    // so this guards the mapping against drifting behind the server.
    expect(Object.keys(STATS_SECTIONS_BY_EVENT_TYPE).sort()).toEqual(
      [
        'apiLatency',
        'commands',
        'guildEvents',
        'interactionEvents',
        'playbackStateChanges',
        'queue',
        'search',
        'sounds',
        'trackEngagement',
        'userSessions',
        'userTrackListens',
        'voice',
        'webEvents',
      ].sort()
    );
  });

  it('never maps a type to the blanket ["stats"] key', () => {
    for (const sections of Object.values(STATS_SECTIONS_BY_EVENT_TYPE)) {
      expect(sections.length).toBeGreaterThan(0);
      expect(sections).not.toContain('');
    }
  });
});
