import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import GuildsStats from '../GuildsStats';
import { renderWithQuery } from '@/test/renderWithQuery';

/**
 * The "Top Guilds" table identified every row by `guild_id` alone — an 18-digit
 * snowflake, unreadable and the widest column in the table. `/api/status`
 * already returns `guilds: [{ id, name }]`, so the name is available on the
 * client without any server change; it just was never joined in.
 *
 * Stats rows are history, so a guild the bot has since left has no name to join
 * to. Those rows must still identify themselves, which is why the id remains the
 * fallback rather than something like "Unknown".
 */
vi.mock('@/lib/api', () => ({
  statsApi: { guilds: vi.fn() },
  botApi: { getStatus: vi.fn() },
}));

const { statsApi, botApi } = await import('@/lib/api');

const JOINED_GUILD_ID = '123456789012345678';
const DEPARTED_GUILD_ID = '987654321098765432';

beforeEach(() => {
  vi.mocked(statsApi.guilds).mockReset();
  vi.mocked(botApi.getStatus).mockReset();

  vi.mocked(statsApi.guilds).mockResolvedValue({
    data: {
      guilds: [
        {
          guild_id: JOINED_GUILD_ID,
          command_count: '9000',
          sound_count: '4000',
          unique_users: '60',
          last_active: '2026-09-24T11:00:00.000Z',
        },
        {
          guild_id: DEPARTED_GUILD_ID,
          command_count: '12',
          sound_count: '3',
          unique_users: '2',
          last_active: '2026-01-02T11:00:00.000Z',
        },
      ],
    },
  } as never);

  vi.mocked(botApi.getStatus).mockResolvedValue({
    data: {
      online: true,
      guilds: [{ id: JOINED_GUILD_ID, name: 'The Rain Room', memberCount: 42 }],
      connections: [],
    },
  } as never);
});

describe('GuildsStats', () => {
  it('shows the guild name for a guild the bot is still in', async () => {
    renderWithQuery(<GuildsStats />);

    expect(await screen.findByText('The Rain Room')).toBeInTheDocument();
  });

  it('does not print the snowflake for a guild it has a name for', async () => {
    renderWithQuery(<GuildsStats />);

    await screen.findByText('The Rain Room');
    expect(screen.queryByText(JOINED_GUILD_ID)).not.toBeInTheDocument();
  });

  it('falls back to the id for a guild no longer joined', async () => {
    renderWithQuery(<GuildsStats />);

    expect(await screen.findByText(DEPARTED_GUILD_ID)).toBeInTheDocument();
  });

  it('still falls back to the id when the status request fails', async () => {
    vi.mocked(botApi.getStatus).mockRejectedValue(new Error('Network Error'));

    renderWithQuery(<GuildsStats />);

    await waitFor(() => {
      expect(screen.getByText(JOINED_GUILD_ID)).toBeInTheDocument();
    });
    expect(screen.getByText(DEPARTED_GUILD_ID)).toBeInTheDocument();
  });
});
