import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import HistoryStats from '../HistoryStats';
import { renderWithQuery } from '@/test/renderWithQuery';

/**
 * Two things about this section.
 *
 * The "Played At" cell was a raw `new Date(entry.played_at).toLocaleString()`, so
 * a row whose timestamp the server could not produce printed the browser's
 * `Invalid Date`. `lib/chartSafety` exists for exactly this; `safeDateTimeLabel`
 * is the date-*and*-time guard (the older `safeDateLabel` is deliberately
 * date-only and would have dropped the time this column shows).
 *
 * And the early `if (isLoading) / if (error) return` unmounted the component's own
 * two date inputs and Filter button — so a 400 caused by a bad date range left no
 * control on screen to correct the range with. The filter row now stays mounted
 * and the loading/error state renders beside it.
 */
vi.mock('@/lib/api', () => ({
  statsApi: { history: vi.fn() },
}));

vi.mock('@/stores/guildStore', () => ({
  useGuildStore: () => ({ selectedGuildId: null }),
}));

const { statsApi } = await import('@/lib/api');

beforeEach(() => {
  vi.mocked(statsApi.history).mockReset();
});

const entry = (overrides: Record<string, unknown> = {}) => ({
  track_title: 'A Track',
  source_type: 'youtube',
  duration: 3661,
  played_at: '2026-09-24T11:00:00.000Z',
  ...overrides,
});

describe('HistoryStats', () => {
  it('never renders Invalid Date for an unparseable timestamp', async () => {
    vi.mocked(statsApi.history).mockResolvedValue({
      data: { history: [entry({ played_at: 'not-a-timestamp' })] },
    } as never);

    renderWithQuery(<HistoryStats />);

    await waitFor(() => expect(screen.getByText('A Track')).toBeInTheDocument());
    expect(screen.queryByText(/Invalid Date/)).not.toBeInTheDocument();
    // Two cells read 'Unknown': the guarded timestamp, and the User column's own
    // fallback for a row with no username.
    expect(screen.getAllByText('Unknown')).toHaveLength(2);
  });

  it('still shows the time, not just the date', async () => {
    vi.mocked(statsApi.history).mockResolvedValue({
      data: { history: [entry({ played_at: '2026-09-24T11:00:00.000Z' })] },
    } as never);

    renderWithQuery(<HistoryStats />);

    await waitFor(() => expect(screen.getByText('A Track')).toBeInTheDocument());
    const expected = new Date('2026-09-24T11:00:00.000Z').toLocaleString();
    expect(screen.getByText(expected)).toBeInTheDocument();
  });

  it('renders a duration with an hour carry', async () => {
    vi.mocked(statsApi.history).mockResolvedValue({
      data: { history: [entry({ duration: 3661 })] },
    } as never);

    renderWithQuery(<HistoryStats />);

    await waitFor(() => expect(screen.getByText('1:01:01')).toBeInTheDocument());
  });

  it('keeps the date range controls mounted while loading', () => {
    vi.mocked(statsApi.history).mockReturnValue(new Promise(() => {}) as never);

    renderWithQuery(<HistoryStats />);

    expect(screen.getAllByPlaceholderText(/date/i)).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Filter' })).toBeInTheDocument();
  });

  it('keeps the date range controls mounted when the request errors', async () => {
    vi.mocked(statsApi.history).mockRejectedValue(new Error('Invalid date range'));

    renderWithQuery(<HistoryStats />);

    await waitFor(() => expect(screen.getByText(/Invalid date range/)).toBeInTheDocument());
    expect(screen.getAllByPlaceholderText(/date/i)).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Filter' })).toBeInTheDocument();
  });
});
