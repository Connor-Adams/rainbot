import { createTRPCProxyClient, httpBatchLink } from '@trpc/client';
import type { AnyRouter } from '@trpc/server';

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/$/, '');
}

export function createTRPCClient<TRouter extends AnyRouter>(options: {
  baseUrl: string;
  secret: string;
}): ReturnType<typeof createTRPCProxyClient<TRouter>> {
  return createTRPCProxyClient<TRouter>({
    links: [
      httpBatchLink({
        url: `${normalizeBaseUrl(options.baseUrl)}/trpc`,
        headers() {
          return {
            'x-internal-secret': options.secret,
          };
        },
      }),
    ],
  });
}
