import type { ReactElement, ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderOptions, type RenderResult } from '@testing-library/react';

/**
 * A query client configured for tests: no retries (an assertion on an error
 * state should not wait out three backoffs) and no cache reuse between tests.
 */
export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
}

export interface RenderWithQueryResult extends RenderResult {
  queryClient: QueryClient;
}

/**
 * Render a component inside a `QueryClientProvider`.
 *
 * Pass an existing `queryClient` to share a mutation cache across two renders —
 * `BotOperations` and `SoundLibraryMaintenance` both key their mutations so an
 * in-flight job stays visible after the section unmounts, and that behaviour is
 * only observable with the same client on both sides of the unmount.
 */
export function renderWithQuery(
  ui: ReactElement,
  options: RenderOptions & { queryClient?: QueryClient } = {}
): RenderWithQueryResult {
  const { queryClient = createTestQueryClient(), ...renderOptions } = options;

  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }

  return {
    ...render(ui, { wrapper: Wrapper, ...renderOptions }),
    queryClient,
  };
}
