import type { UseQueryResult } from '@tanstack/react-query';
import { useQuery } from '@tanstack/react-query';
import type { AxiosResponse } from 'axios';
import type { ApiReadOptions } from '@/lib/api';

interface UseStatsQueryOptions<T> {
  queryKey: readonly unknown[];
  /**
   * Receives React Query's query context. Pass its `signal` straight into the
   * `statsApi` call — `({ signal }) => statsApi.queue({ signal })` — so the
   * request is abortable.
   */
  queryFn: (context: Required<ApiReadOptions>) => Promise<AxiosResponse<T>>;
  refetchInterval?: number;
  staleTime?: number;
  enabled?: boolean;
}

/** Fallback refresh cadence for a section that does not name its own. */
const DEFAULT_REFETCH_INTERVAL = 60000;

/**
 * The one hook every Statistics section fetches through.
 *
 * All 21 sections route through here so that two policies live in one place
 * instead of being repeated (and drifting) across 21 components:
 *
 * 1. **Cancellation.** The `signal` from React Query's query context is handed
 *    to the `queryFn` and on into Axios. Sections mount and unmount as the tab
 *    strip is arrowed through — and that strip activates automatically, so
 *    stepping across all 21 sections used to fire ~20 requests that no longer
 *    had a component waiting for them and could not be called off. Reading
 *    `signal` here is also what arms React Query's own cancellation: it only
 *    aborts a query whose `queryFn` actually consumed the signal.
 *
 * 2. **Staleness matched to the section's own refresh rate.** `staleTime`
 *    defaults to this query's `refetchInterval`, not to the app-wide 5s. A
 *    section that asks to be refetched every 30s has already declared 30s-old
 *    data acceptable; a 5s `staleTime` contradicted that by forcing a fresh
 *    request every time the section was remounted, which is why arrowing back
 *    over sections re-requested all of them. This aligns the two numbers
 *    rather than inventing a new freshness policy — background refetching on
 *    `refetchInterval` is unchanged, so a section on screen refreshes exactly
 *    as often as it did before.
 */
export function useStatsQuery<T>(options: UseStatsQueryOptions<T>): UseQueryResult<T> {
  const refetchInterval = options.refetchInterval ?? DEFAULT_REFETCH_INTERVAL;

  return useQuery<T>({
    queryKey: options.queryKey,
    queryFn: ({ signal }) => options.queryFn({ signal }).then((res) => res.data),
    refetchInterval,
    staleTime: options.staleTime ?? refetchInterval,
    enabled: options.enabled,
  });
}
