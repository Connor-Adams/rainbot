import { createTRPCProxyClient, httpBatchLink } from '@trpc/client';
import type { AnyRouter } from '@trpc/server';

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/$/, '');
}

export function createTRPCClient<TRouter extends AnyRouter>(options: {
  baseUrl: string;
  secret: string;
}): ReturnType<typeof createTRPCProxyClient<TRouter>> {
  const link = httpBatchLink<TRouter>({
    url: `${normalizeBaseUrl(options.baseUrl)}/trpc`,
    headers() {
      return {
        'x-internal-secret': options.secret,
      };
    },
  });

  return createTRPCProxyClient<TRouter>({
    links: [link],
  });
}
