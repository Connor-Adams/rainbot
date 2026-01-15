import { createTRPCProxyClient, httpBatchLink, type CreateTRPCClientOptions } from '@trpc/client';
import type { AnyRouter } from '@trpc/server';

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/$/, '');
}

type TransformerOption<TRouter extends AnyRouter> =
  CreateTRPCClientOptions<TRouter> extends { transformer: infer T }
    ? { transformer: T }
    : CreateTRPCClientOptions<TRouter> extends { transformer?: infer T }
      ? { transformer?: T }
      : {};

type TRPCClientOptions<TRouter extends AnyRouter> = {
  baseUrl: string;
  secret: string;
} & TransformerOption<TRouter>;

export function createTRPCClient<TRouter extends AnyRouter>(
  options: TRPCClientOptions<TRouter>
): ReturnType<typeof createTRPCProxyClient<TRouter>> {
  const { baseUrl, secret, ...clientOptions } = options;
  const link = httpBatchLink<TRouter>({
    url: `${normalizeBaseUrl(baseUrl)}/trpc`,
    headers() {
      return {
        'x-internal-secret': secret,
      };
    },
  });

  const trpcOptions = {
    links: [link],
    ...(clientOptions as unknown as TransformerOption<TRouter>),
  } as CreateTRPCClientOptions<TRouter>;

  return createTRPCProxyClient<TRouter>(trpcOptions);
}
