import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import GuildPicker from '../GuildPicker';
import { renderWithQuery } from '@/test/renderWithQuery';
import { useGuildStore } from '@/stores/guildStore';

/**
 * The picker used one placeholder — "Loading servers..." — for every state in
 * which the guild list was empty. An empty list is three different situations:
 * the request is still in flight, it came back with no mutual guilds, or it
 * failed. Two of those are not loading, and saying so was a lie that never
 * resolved.
 *
 * All three are asserted through the `placeholder` attribute of the design
 * system's `role="combobox"` input, which is where `Combobox` puts it while
 * nothing is selected.
 */
vi.mock('@/lib/api', () => ({
  botApi: { getStatus: vi.fn() },
}));

const { botApi } = await import('@/lib/api');

const GUILDS = [{ id: '111', name: 'The Rain Room', memberCount: 42 }];

beforeEach(() => {
  // `clearMocks` wipes call history but not a queued `mockResolvedValueOnce`,
  // and it does not clear a previous test's persistent implementation either.
  vi.mocked(botApi.getStatus).mockReset();
  useGuildStore.setState({ selectedGuildId: null });
  localStorage.clear();
});

function picker() {
  return screen.getByRole('combobox');
}

describe('GuildPicker placeholder', () => {
  it('says it is loading only while the request is actually in flight', () => {
    vi.mocked(botApi.getStatus).mockReturnValue(new Promise<never>(() => {}) as never);

    renderWithQuery(<GuildPicker />);

    expect(picker()).toHaveAttribute('placeholder', 'Loading servers...');
    expect(picker()).toBeDisabled();
  });

  it('does not claim to be loading when the request succeeded with zero guilds', async () => {
    vi.mocked(botApi.getStatus).mockResolvedValue({
      data: { online: true, guilds: [], connections: [] },
    } as never);

    renderWithQuery(<GuildPicker />);

    await waitFor(() => {
      expect(picker()).toHaveAttribute('placeholder', 'No servers available');
    });
    expect(picker()).toBeDisabled();
  });

  it('does not claim to be loading when the request failed', async () => {
    vi.mocked(botApi.getStatus).mockRejectedValue(new Error('Network Error'));

    renderWithQuery(<GuildPicker />);

    await waitFor(() => {
      expect(picker()).toHaveAttribute('placeholder', 'Servers unavailable');
    });
    expect(picker()).toBeDisabled();
  });

  it('offers a real choice once guilds arrive', async () => {
    vi.mocked(botApi.getStatus).mockResolvedValue({
      data: { online: true, guilds: GUILDS, connections: [] },
    } as never);

    renderWithQuery(<GuildPicker />);

    await waitFor(() => {
      expect(picker()).toHaveAttribute('placeholder', 'Select a server...');
    });
    expect(picker()).toBeEnabled();
  });
});
