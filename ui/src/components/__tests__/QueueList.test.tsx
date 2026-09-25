import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import QueueList from '../QueueList';
import { renderWithQuery } from '@/test/renderWithQuery';
import { useGuildStore } from '@/stores/guildStore';

/**
 * `clearMutation` had an `onSuccess` that reset a hand-rolled `isClearing` flag
 * and no `onError` at all, while `handleClear` set the flag before mutating. A
 * failed `POST /queue/:id/clear` therefore left the Clear button disabled with
 * its label hidden behind a spinner, permanently — the only way back was a page
 * reload. The mutation already publishes `isPending`, which cannot get stuck.
 */
vi.mock('@/lib/api', () => ({
  botApi: { getQueue: vi.fn(), clearQueue: vi.fn(), removeFromQueue: vi.fn() },
}));

const { botApi } = await import('@/lib/api');

const GUILD_ID = '123456789012345678';

const track = (title: string) => ({
  kind: 'music',
  title,
  url: `https://example.com/${title}`,
  durationMs: 120000,
});

beforeEach(() => {
  useGuildStore.setState({ selectedGuildId: GUILD_ID });
  vi.mocked(botApi.getQueue).mockReset();
  vi.mocked(botApi.clearQueue).mockReset();
  vi.mocked(botApi.getQueue).mockResolvedValue({
    data: { queue: [track('one')], history: [], isPaused: false, isAutoplay: false },
  } as never);
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

describe('QueueList — a failed clear', () => {
  it('leaves the Clear button usable so the user can try again', async () => {
    vi.mocked(botApi.clearQueue).mockRejectedValue(new Error('Bot not ready'));

    renderWithQuery(<QueueList />);

    const clear = await screen.findByRole('button', { name: /Clear/ });
    expect(clear).not.toBeDisabled();

    fireEvent.click(clear);

    await waitFor(() => expect(botApi.clearQueue).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByRole('button', { name: /Clear/ })).not.toBeDisabled());
    expect(screen.getByRole('button', { name: /Clear/ })).toHaveTextContent('Clear');

    // And it really is usable again, not merely re-enabled.
    fireEvent.click(screen.getByRole('button', { name: /Clear/ }));
    await waitFor(() => expect(botApi.clearQueue).toHaveBeenCalledTimes(2));
  });

  it('still shows the loading state while the clear is in flight', async () => {
    let resolve: (() => void) | undefined;
    vi.mocked(botApi.clearQueue).mockReturnValue(
      new Promise((r) => {
        resolve = () => r({ data: {} } as never);
      }) as never
    );

    renderWithQuery(<QueueList />);
    fireEvent.click(await screen.findByRole('button', { name: /Clear/ }));

    await waitFor(() => expect(screen.getByRole('button', { name: /Clear/ })).toBeDisabled());

    resolve?.();
    await waitFor(() => expect(screen.getByRole('button', { name: /Clear/ })).not.toBeDisabled());
  });
});
