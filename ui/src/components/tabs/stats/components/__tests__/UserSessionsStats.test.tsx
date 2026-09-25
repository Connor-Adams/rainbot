import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import UserSessionsStats from '../UserSessionsStats';
import { renderWithQuery } from '@/test/renderWithQuery';

/**
 * The second of the two verbatim copies of the broken session duration helper.
 * `total_duration` here is `SUM(duration_seconds)` — Postgres returns `bigint`
 * for a sum of `int4`, which node-postgres hands back as a *string*, so the
 * `safeInt` around it is load-bearing and the `string` type on that field is
 * correct. `UserSession.duration_seconds` was declared `string` too, but that
 * column is a plain nullable `INTEGER` and arrives as `number | null`.
 */
vi.mock('@/lib/api', () => ({
  statsApi: { userSessions: vi.fn() },
}));

const { statsApi } = await import('@/lib/api');

beforeEach(() => {
  vi.mocked(statsApi.userSessions).mockReset();
  vi.mocked(statsApi.userSessions).mockResolvedValue({
    data: {
      summary: {
        total_sessions: '2',
        unique_users: '2',
        avg_duration_seconds: '45',
        total_duration_seconds: '90',
        avg_tracks_per_session: '1.5',
        total_tracks_heard: '3',
      },
      sessions: [],
      topListeners: [
        {
          user_id: '111111111111111111',
          username: 'brief',
          session_count: '1',
          total_duration: '45',
          total_tracks: '1',
        },
        {
          user_id: '222222222222222222',
          username: 'longer',
          session_count: '1',
          total_duration: '3659',
          total_tracks: '2',
        },
      ],
    },
  } as never);
});

describe('UserSessionsStats durations', () => {
  it('renders a sub-minute listener total in seconds, not as 0m', async () => {
    renderWithQuery(<UserSessionsStats />);

    // Both the "Avg Duration" tile and the top-listener row are 45s.
    await waitFor(() => expect(screen.getAllByText('45s')).toHaveLength(2));
    expect(screen.queryByText('0m')).not.toBeInTheDocument();
  });

  it('still renders hours and minutes above an hour', async () => {
    renderWithQuery(<UserSessionsStats />);

    await waitFor(() => expect(screen.getByText('1h 0m')).toBeInTheDocument());
  });

  it('formats the summary tiles with the shared helper', async () => {
    renderWithQuery(<UserSessionsStats />);

    // avg 45s (was `0m`) and total 90s = 1m 30s (was `1m`).
    await waitFor(() => expect(screen.getByText('1m 30s')).toBeInTheDocument());
  });
});
