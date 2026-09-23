import { createTRPCProxyClient, httpBatchLink, type CreateTRPCClientOptions } from '@trpc/client';
import type { AnyRouter } from '@trpc/server';
import { withSpan, recordRpcDuration, RainbotAttr } from '@rainbot/observability/node';

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/$/, '');
}

type TransformerOption<TRouter extends AnyRouter> =
  CreateTRPCClientOptions<TRouter> extends { transformer: infer T }
    ? { transformer: T }
    : CreateTRPCClientOptions<TRouter> extends { transformer?: infer T }
      ? { transformer?: T }
      : Record<string, never>;

type TRPCClientOptions<TRouter extends AnyRouter> = {
  baseUrl: string;
  secret: string;
  /** Worker name (e.g. 'rainbot'), recorded on every RPC span/metric as RainbotAttr.worker. */
  worker: string;
} & TransformerOption<TRouter>;

/**
 * Terminal tRPC proxy methods that actually issue a call. `subscribe` is
 * deliberately excluded: it doesn't return a promise (it takes observer
 * callbacks and returns an unsubscribe function synchronously), so wrapping
 * it with the same async span/duration logic would change its control flow.
 * No router in this codebase uses subscriptions today.
 */
const INSTRUMENTED_METHODS = new Set(['query', 'mutate']);

/**
 * Wraps a tRPC proxy client so every `.query()`/`.mutate()` call is timed and
 * traced, without changing what the call returns or throws. The tRPC proxy
 * client builds its procedure calls lazily via nested Proxies keyed by
 * property access (e.g. `client.join.mutate(...)`), so we mirror that shape:
 * recurse through property access accumulating the path, and only intercept
 * at the terminal `query`/`mutate` call.
 */
function instrumentClient<T>(value: T, worker: string, path: string[]): T {
  if (value === null || (typeof value !== 'object' && typeof value !== 'function')) {
    return value;
  }

  return new Proxy(value as object, {
    get(target, prop, receiver) {
      const child = Reflect.get(target, prop, receiver);
      if (typeof prop !== 'string') {
        return child;
      }

      if (INSTRUMENTED_METHODS.has(prop) && typeof child === 'function') {
        const procedure = path.join('.');
        const attributes = {
          [RainbotAttr.rpcProcedure]: procedure,
          [RainbotAttr.worker]: worker,
        };
        return async (...args: unknown[]) => {
          const startedAt = Date.now();
          try {
            return await withSpan('worker.rpc', attributes, () =>
              Reflect.apply(child as (...a: unknown[]) => Promise<unknown>, target, args)
            );
          } finally {
            recordRpcDuration(Date.now() - startedAt, attributes);
          }
        };
      }

      return instrumentClient(child, worker, [...path, prop]);
    },
  }) as T;
}

export function createTRPCClient<TRouter extends AnyRouter>(
  options: TRPCClientOptions<TRouter>
): ReturnType<typeof createTRPCProxyClient<TRouter>> {
  const { baseUrl, secret, worker, ...clientOptions } = options;
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

  const rawClient = createTRPCProxyClient<TRouter>(trpcOptions);
  return instrumentClient(rawClient, worker, []);
}
