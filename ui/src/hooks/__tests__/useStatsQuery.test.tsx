import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, useMutation } from '@tanstack/react-query';
import { screen, waitFor } from '@testing-library/react';
import axios from 'axios';
import { useStatsQuery } from '../useStatsQuery';
import { renderWithQuery } from '@/test/renderWithQuery';

/**
 * Cancellation, end to end through the hook every Statistics section fetches
 * through.
 *
 * The Statistics tab strip activates on arrow-key focus, so stepping across its
 * 21 sections mounts and unmounts 21 components in a few seconds. Each one's
 * request used to outlive its component: React Query aborted its `AbortSignal`,
 * but nothing had wired that signal into Axios, and React Query only bothers to
 * abort a query whose `queryFn` actually read the signal. These tests pin both
 * halves — the signal is read, and the abort is observable.
 */

vi.mock('@/lib/api', () => ({
  statsApi: { queue: vi.fn() },
  adminApi: { deployCommands: vi.fn() },
  queryRetry: (count: number, error: unknown) => {
    const err = error as { code?: string; name?: string } | null;
    if (err?.code === 'ERR_CANCELED' || err?.name === 'CanceledError') return false;
    return count < 1;
  },
}));

const { statsApi, adminApi, queryRetry } = await import('@/lib/api');

/** A client that keeps query state across an unmount, with the app's retry rule. */
function persistentClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: queryRetry as (count: number, error: unknown) => boolean,
        gcTime: 5 * 60 * 1000,
        staleTime: 5000,
      },
      mutations: { retry: false },
    },
  });
}

const QUEUE_KEY = ['stats', 'queue'];

function QueueSection() {
  const { data, isLoading, error } = useStatsQuery<{ n: number }>({
    queryKey: QUEUE_KEY,
    queryFn: ({ signal }) => statsApi.queue({ signal }),
    refetchInterval: 30000,
  });

  if (isLoading) return <div>loading queue</div>;
  if (error) return <div role="alert">Error: {(error as Error).message}</div>;
  return <div>rows={data?.n}</div>;
}

/** Captures the signal handed to the api, and parks the request in flight. */
function captureSignal(opts?: { rejectOnAbort?: boolean }) {
  const captured: { signal?: AbortSignal } = {};
  vi.mocked(statsApi.queue).mockImplementation(((o: { signal?: AbortSignal }) => {
    captured.signal = o?.signal;
    return new Promise((_resolve, reject) => {
      if (opts?.rejectOnAbort && o?.signal) {
        o.signal.addEventListener('abort', () => {
          // What Axios really does when its signal fires.
          reject(new axios.CanceledError('canceled'));
        });
      }
    });
  }) as never);
  return captured;
}

beforeEach(() => {
  vi.mocked(statsApi.queue).mockReset();
  vi.mocked(adminApi.deployCommands).mockReset();
});

describe('a stats query aborts when its section unmounts mid-flight', () => {
  it('hands the api an AbortSignal that is live while mounted', async () => {
    const captured = captureSignal();

    renderWithQuery(<QueueSection />);

    await waitFor(() => expect(captured.signal).toBeInstanceOf(AbortSignal));
    expect(captured.signal!.aborted).toBe(false);
  });

  it('aborts that signal when the component unmounts before the response', async () => {
    const captured = captureSignal();

    const { unmount } = renderWithQuery(<QueueSection />);
    await waitFor(() => expect(captured.signal).toBeInstanceOf(AbortSignal));
    expect(captured.signal!.aborted).toBe(false);

    unmount();

    await waitFor(() => expect(captured.signal!.aborted).toBe(true));
  });

  it('does not abort a request that already came back', async () => {
    const captured: { signal?: AbortSignal } = {};
    vi.mocked(statsApi.queue).mockImplementation(((o: { signal?: AbortSignal }) => {
      captured.signal = o?.signal;
      return Promise.resolve({ data: { n: 7 } });
    }) as never);

    const { unmount } = renderWithQuery(<QueueSection />);
    await screen.findByText('rows=7');

    unmount();

    // Nothing is in flight, so there is nothing to call off.
    expect(captured.signal!.aborted).toBe(false);
  });
});

describe('an aborted request is not an error the user sees', () => {
  it('leaves no error in the query state and is never retried', async () => {
    const captured = captureSignal({ rejectOnAbort: true });
    const queryClient = persistentClient();

    const { unmount } = renderWithQuery(<QueueSection />, { queryClient });
    await waitFor(() => expect(captured.signal).toBeInstanceOf(AbortSignal));

    unmount();
    await waitFor(() => expect(captured.signal!.aborted).toBe(true));
    // let the CanceledError rejection settle
    await new Promise((r) => setTimeout(r, 0));

    const state = queryClient.getQueryState(QUEUE_KEY);
    expect(state?.status).not.toBe('error');
    expect(state?.error).toBeNull();
    // `retry: 1` would have re-issued the request we just cancelled.
    expect(statsApi.queue).toHaveBeenCalledTimes(1);
  });

  it('renders no error panel when the section is reopened after an abort', async () => {
    const captured = captureSignal({ rejectOnAbort: true });
    const queryClient = persistentClient();

    const first = renderWithQuery(<QueueSection />, { queryClient });
    await waitFor(() => expect(captured.signal).toBeInstanceOf(AbortSignal));
    first.unmount();
    await waitFor(() => expect(captured.signal!.aborted).toBe(true));
    await new Promise((r) => setTimeout(r, 0));

    // Reopening the section must not greet the user with "Error: canceled".
    vi.mocked(statsApi.queue).mockResolvedValue({ data: { n: 3 } } as never);
    renderWithQuery(<QueueSection />, { queryClient });

    expect(screen.queryByRole('alert')).toBeNull();
    await screen.findByText('rows=3');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('still surfaces a genuine failure', async () => {
    vi.mocked(statsApi.queue).mockRejectedValue(new Error('Request failed with status code 500'));

    renderWithQuery(<QueueSection />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Request failed with status code 500');
  });
});

describe('a mutation in flight is not aborted by unmount', () => {
  function DeployButton() {
    const { mutate } = useMutation({
      mutationKey: ['deploy-commands'],
      mutationFn: () => adminApi.deployCommands(),
    });
    return (
      <button type="button" onClick={() => mutate()}>
        Deploy
      </button>
    );
  }

  it('lets a POST that already reached the server run to completion', async () => {
    let settle: ((value: unknown) => void) | undefined;
    const calledWith: unknown[][] = [];
    vi.mocked(adminApi.deployCommands).mockImplementation(((...args: unknown[]) => {
      calledWith.push(args);
      return new Promise((resolve) => {
        settle = resolve;
      });
    }) as never);

    const queryClient = persistentClient();
    const { unmount } = renderWithQuery(<DeployButton />, { queryClient });

    screen.getByRole('button', { name: 'Deploy' }).click();
    await waitFor(() => expect(adminApi.deployCommands).toHaveBeenCalledTimes(1));

    // The section is closed while the deploy is still running.
    unmount();

    // No signal was ever handed to the mutation, so there is nothing that
    // unmounting could have aborted.
    expect(calledWith[0]).toEqual([]);

    settle!({ data: { message: 'ok', count: 12, guildId: null } });

    await waitFor(() => {
      const mutation = queryClient.getMutationCache().getAll()[0];
      expect(mutation?.state.status).toBe('success');
    });
    // Not re-sent, not cancelled.
    expect(adminApi.deployCommands).toHaveBeenCalledTimes(1);
  });
});
