import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import UsersStats from '../UsersStats';
import { renderWithQuery } from '@/test/renderWithQuery';

/**
 * The "Last Active" cell was a raw `new Date(user.last_active).toLocaleString()`,
 * so a row whose timestamp the server could not produce printed the browser's
 * `Invalid Date`. It now uses `safeDateTimeLabel`, the date-and-time guard in
 * `lib/chartSafety` — the date-only `safeDateLabel` would have dropped the time
 * this column shows.
 */
vi.mock('@/lib/api', () => ({
  statsApi: { users: vi.fn() },
}));

const { statsApi } = await import('@/lib/api');

beforeEach(() => {
  vi.mocked(statsApi.users).mockReset();
});

const user = (overrides: Record<string, unknown> = {}) => ({
  user_id: '111111111111111111',
  username: 'someone',
  discriminator: '0',
  guild_id: '222222222222222222',
  command_count: '10',
  sound_count: '2',
  last_active: '2026-09-24T11:00:00.000Z',
  ...overrides,
});

describe('UsersStats last active', () => {
  it('never renders Invalid Date for an unparseable timestamp', async () => {
    vi.mocked(statsApi.users).mockResolvedValue({
      data: { users: [user({ last_active: 'not-a-timestamp' })] },
    } as never);

    renderWithQuery(<UsersStats />);

    await waitFor(() => expect(screen.getByText('someone')).toBeInTheDocument());
    expect(screen.queryByText(/Invalid Date/)).not.toBeInTheDocument();
    expect(screen.getByText('Unknown')).toBeInTheDocument();
  });

  it('still shows the time, not just the date', async () => {
    vi.mocked(statsApi.users).mockResolvedValue({
      data: { users: [user()] },
    } as never);

    renderWithQuery(<UsersStats />);

    await waitFor(() => expect(screen.getByText('someone')).toBeInTheDocument());
    const expected = new Date('2026-09-24T11:00:00.000Z').toLocaleString();
    expect(screen.getByText(expected)).toBeInTheDocument();
  });

  it('keeps Never for a user who has no last_active at all', async () => {
    vi.mocked(statsApi.users).mockResolvedValue({
      data: { users: [user({ last_active: undefined })] },
    } as never);

    renderWithQuery(<UsersStats />);

    await waitFor(() => expect(screen.getByText('Never')).toBeInTheDocument());
  });
});
