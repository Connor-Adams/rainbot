import type { UseQueryResult } from '@tanstack/react-query';
import { useQuery } from '@tanstack/react-query';
import { create } from 'zustand';
import { botApi } from '@/lib/api';
import type { BotStatus, QueueData } from '@/types';

/**
 * The dashboard's live refresh cadence, in one place.
 *
 * It used to be a `5000` literal repeated at every call site — seven for
 * `['bot-status']` alone — which is what made the SSE optimisation below
 * impossible to express.
 */
export const LIVE_POLL_INTERVAL = 5000;

/**
 * Why these two queries are defined here and nowhere else.
 *
 * `refetchInterval` is a **per-observer** option: React Query hands every
 * observer of a key its own interval timer and never reconciles them, so one
 * component returning `false` cannot stop another's timer. `PlayerTab` set
 * `refetchInterval: isSSEConnected ? false : 5000` for `['bot-status']` and
 * `['queue', guildId]` — and both optimisations were completely inert, because
 * `Header` (in `Layout`, mounted on every route), `GuildPicker`, `QueueList`
 * (in `Sidebar`, likewise), `ConnectionsList`, `ServersList`, `StatusTab` and
 * `GuildsStats` each polled the same keys at a hardcoded 5000. Measured with
 * both streams open: one request per key on mount, then three more over the next
 * sixteen seconds.
 *
 * A key's cadence therefore has to be single-owned, and there are only two
 * places that can own it: the QueryClient's per-key defaults, or one hook every
 * observer goes through. `queryClient.setQueryDefaults` is the wrong tool — it
 * does not notify live observers when the default changes, so flipping it as a
 * stream connects or drops would leave existing timers running. So it is a hook,
 * matching `useStatsQuery`, which already owns cancellation and staleness for the
 * 21 Statistics sections for exactly the same reason: a policy repeated across
 * call sites is a policy that drifts.
 *
 * The SSE-connected flag is hoisted out of component state into the module store
 * below for the same reason — every observer of a key must compute the *same*
 * interval, and a flag held in one component's `useState` is invisible to the
 * rest.
 */
interface LiveStreamState {
  /**
   * Open (`onopen` has fired) SSE streams, per stream key. A count rather than a
   * boolean so two components subscribed to the same stream cannot clobber one
   * another's flag as they mount and unmount.
   */
  openCounts: Record<string, number>;
}

const useLiveStreamStore = create<LiveStreamState>(() => ({ openCounts: {} }));

/** Stream key for the bot-status stream (`GET /api/status/events`). */
export const STATUS_STREAM = 'status';

/** Stream key for one guild's queue stream (`GET /api/queue/:id/events`). */
export const queueStream = (guildId: string): string => `queue:${guildId}`;

/**
 * Record that an SSE stream is open, and return the release to call when it
 * closes or errors. Called by `useStatusEvents` / `useQueueEvents`, which own
 * the `EventSource` itself.
 */
export function openLiveStream(key: string): () => void {
  useLiveStreamStore.setState((state) => ({
    openCounts: { ...state.openCounts, [key]: (state.openCounts[key] ?? 0) + 1 },
  }));

  let released = false;
  return () => {
    if (released) return;
    released = true;
    useLiveStreamStore.setState((state) => {
      const openCounts = { ...state.openCounts };
      const next = (openCounts[key] ?? 1) - 1;
      if (next > 0) {
        openCounts[key] = next;
      } else {
        delete openCounts[key];
      }
      return { openCounts };
    });
  };
}

/** Is an SSE stream for `key` currently open? */
function useLiveStreamOpen(key: string | null): boolean {
  return useLiveStreamStore((state) => (key ? (state.openCounts[key] ?? 0) > 0 : false));
}

/**
 * `GET /api/status`. The only definition of the `['bot-status']` query.
 *
 * Polls every `LIVE_POLL_INTERVAL` unless the status SSE stream is open, in
 * which case it does not poll at all — the stream pushes straight into this
 * cache key (see `useStatusEvents`).
 */
export function useBotStatusQuery<T = BotStatus>(): UseQueryResult<T> {
  const streamOpen = useLiveStreamOpen(STATUS_STREAM);

  return useQuery<T>({
    queryKey: ['bot-status'],
    queryFn: ({ signal }) => botApi.getStatus({ signal }).then((res) => res.data as T),
    refetchInterval: streamOpen ? false : LIVE_POLL_INTERVAL,
  });
}

/**
 * `GET /api/queue/:guildId`. The only definition of the `['queue', guildId]`
 * query. Disabled with no guild selected, and silent while that guild's queue
 * SSE stream is open.
 */
export function useQueueQuery<T = QueueData>(guildId: string | null): UseQueryResult<T> {
  const streamOpen = useLiveStreamOpen(guildId ? queueStream(guildId) : null);

  return useQuery<T>({
    queryKey: ['queue', guildId],
    queryFn: ({ signal }) => botApi.getQueue(guildId!, { signal }).then((res) => res.data as T),
    enabled: !!guildId,
    refetchInterval: streamOpen ? false : LIVE_POLL_INTERVAL,
  });
}
