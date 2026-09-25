import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from '@testing-library/react';
import { QueryClient } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import Header from '../Header';
import QueueList from '../QueueList';
import PlayerTab from '@/components/tabs/PlayerTab';
import { renderWithQuery } from '@/test/renderWithQuery';
import { useGuildStore } from '@/stores/guildStore';

/**
 * `refetchInterval` is a PER-OBSERVER option: React Query gives every observer
 * of a key its own interval timer, so one component returning `false` cannot
 * stop another's. Both SSE "reduce polling when the stream is live"
 * optimisations were therefore inert — `PlayerTab` set `false` while `Header`
 * and `QueueList` (both mounted on every route, via `Layout` and `Sidebar`)
 * polled the same two keys at a hardcoded 5000.
 *
 * The fix has to make the cadence for a key single-owned, so this counts real
 * requests through `botApi` with the stream open: one on mount, none after.
 */
vi.mock('@/lib/api', () => ({
  botApi: { getStatus: vi.fn(), getQueue: vi.fn(), clearQueue: vi.fn(), removeFromQueue: vi.fn() },
  playbackApi: {
    play: vi.fn(),
    speak: vi.fn(),
    stop: vi.fn(),
    volume: vi.fn(),
    autoplay: vi.fn(),
  },
  createApiEventSource: () => new FakeEventSource(),
}));

const { botApi } = await import('@/lib/api');

const GUILD_ID = '123456789012345678';

/** An SSE stream that connects. `queueMicrotask` so it opens without a timer. */
class FakeEventSource {
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  private closed = false;

  constructor() {
    queueMicrotask(() => {
      if (!this.closed) this.onopen?.(new Event('open'));
    });
  }

  addEventListener(): void {}
  removeEventListener(): void {}
  close(): void {
    this.closed = true;
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  useGuildStore.setState({ selectedGuildId: GUILD_ID });
  vi.mocked(botApi.getStatus).mockReset();
  vi.mocked(botApi.getQueue).mockReset();
  vi.mocked(botApi.getStatus).mockResolvedValue({
    data: { online: true, guilds: [], connections: [] },
  } as never);
  vi.mocked(botApi.getQueue).mockResolvedValue({
    data: { queue: [], history: [], isPaused: false, isAutoplay: false },
  } as never);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('live polling with the SSE streams open', () => {
  it('issues one request per key on mount and none while the streams stay open', async () => {
    // The app's own client: `staleTime: 5000` from main.tsx, so a second
    // observer mounting does not itself count as a poll.
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 5000, refetchOnWindowFocus: false } },
    });

    await act(async () => {
      renderWithQuery(
        <MemoryRouter initialEntries={['/player']}>
          <Header user={null} onLogout={() => {}} />
          <PlayerTab />
          <QueueList />
        </MemoryRouter>,
        { queryClient }
      );
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    const afterMount = {
      status: vi.mocked(botApi.getStatus).mock.calls.length,
      queue: vi.mocked(botApi.getQueue).mock.calls.length,
    };

    await act(async () => {
      await vi.advanceTimersByTimeAsync(16000);
    });

    const after16s = {
      status: vi.mocked(botApi.getStatus).mock.calls.length,
      queue: vi.mocked(botApi.getQueue).mock.calls.length,
    };

    console.log(
      `POLL COUNTS >>> bot-status after mount: ${afterMount.status} | after 16s: ${after16s.status}` +
        ` || queue after mount: ${afterMount.queue} | after 16s: ${after16s.queue}`
    );

    expect(afterMount).toEqual({ status: 1, queue: 1 });
    expect(after16s).toEqual({ status: 1, queue: 1 });
  });
});
