import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import SessionsStats from '../SessionsStats';
import { renderWithQuery } from '@/test/renderWithQuery';

/**
 * `SessionsStats` and `UserSessionsStats` each carried a private copy of the
 * same duration helper, and both printed `${minutes}m` whenever `hours === 0`.
 * Every session shorter than a minute therefore rendered `0m` — the same thing
 * a session of zero length renders — and every sub-hour duration dropped its
 * seconds remainder, so the "Total Time" tile under-reported a library of short
 * sessions. Both now call the shared `formatSessionDuration` from `@/lib/utils`.
 *
 * The `duration_seconds` column is `INTEGER` (nullable) on `voice_sessions`
 * (`packages/utils/src/database.ts`), so node-postgres hands it back as a JS
 * `number | null` — hence the `null` row below, which the old call site fed
 * straight into arithmetic without `safeInt`.
 */
vi.mock('@/lib/api', () => ({
  statsApi: { sessions: vi.fn() },
}));

const { statsApi } = await import('@/lib/api');

beforeEach(() => {
  vi.mocked(statsApi.sessions).mockReset();
  vi.mocked(statsApi.sessions).mockResolvedValue({
    data: {
      summary: {
        total_sessions: '3',
        avg_duration_seconds: '45',
        total_duration_seconds: '135',
        avg_tracks_per_session: '1.0',
        total_tracks: '3',
        avg_peak_users: '1.0',
      },
      sessions: [
        {
          session_id: 'sess-short',
          channel_name: 'General',
          started_at: '2026-09-24T11:00:00.000Z',
          duration_seconds: 45,
          tracks_played: 1,
          user_count_peak: 1,
        },
        {
          session_id: 'sess-mid',
          channel_name: 'Music',
          started_at: '2026-09-24T12:00:00.000Z',
          duration_seconds: 599,
          tracks_played: 4,
          user_count_peak: 2,
        },
        {
          session_id: 'sess-null',
          channel_name: 'Ghost',
          started_at: '2026-09-24T13:00:00.000Z',
          duration_seconds: null,
          tracks_played: 0,
          user_count_peak: 1,
        },
      ],
      daily: [],
    },
  } as never);
});

describe('SessionsStats durations', () => {
  it('renders a sub-minute session in seconds, not as 0m', async () => {
    renderWithQuery(<SessionsStats />);

    // Both the "Avg Duration" tile and the session row are 45s.
    await waitFor(() => expect(screen.getAllByText('45s')).toHaveLength(2));
    expect(screen.queryByText('0m')).not.toBeInTheDocument();
  });

  it('keeps the seconds remainder of a sub-hour session', async () => {
    renderWithQuery(<SessionsStats />);

    await waitFor(() => expect(screen.getByText('9m 59s')).toBeInTheDocument());
  });

  it('renders a null duration through safeInt rather than raw arithmetic', async () => {
    renderWithQuery(<SessionsStats />);

    await waitFor(() => expect(screen.getByText('Ghost')).toBeInTheDocument());
    // The row exists and shows a zero length, not NaN and not `0m`.
    expect(screen.getAllByText('0s').length).toBeGreaterThan(0);
  });

  it('formats the summary tiles with the same helper', async () => {
    renderWithQuery(<SessionsStats />);

    // avg 45s and total 135s = 2m 15s — both sub-hour, both previously `0m`/`2m`.
    await waitFor(() => expect(screen.getByText('2m 15s')).toBeInTheDocument());
  });
});
