import type { UseQueryResult } from '@tanstack/react-query';
import { useQuery } from '@tanstack/react-query';
import type { AxiosResponse } from 'axios';

interface UseStatsQueryOptions<T> {
  queryKey: readonly unknown[];
  queryFn: () => Promise<AxiosResponse<T>>;
  refetchInterval?: number;
  enabled?: boolean;
}

/**
 * Custom hook for stats queries with consistent configuration
 */
export function useStatsQuery<T>(options: UseStatsQueryOptions<T>): UseQueryResult<T> {
  return useQuery<T>({
    queryKey: options.queryKey,
    queryFn: () => options.queryFn().then((res) => res.data),
    refetchInterval: options.refetchInterval ?? 30000,
    enabled: options.enabled,
  });
}
