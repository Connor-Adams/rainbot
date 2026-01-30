import { createTRPCClient } from '@rainbot/rpc';
import type { HungerbotRouter, PranjeetRouter, RainbotRouter } from '@rainbot/rpc';
import type { StatusResponse } from '@rainbot/worker-protocol';

/** Same secret workers use (WORKER_SECRET); used for tRPC x-internal-secret header. */
const RPC_SECRET = process.env['WORKER_SECRET'] || process.env['INTERNAL_RPC_SECRET'] || '';

function normalizeRpcBaseUrl(rawUrl: string, fallback: string): string {
  const candidate = rawUrl.trim();
  if (!candidate) return fallback;
  const withScheme = candidate.match(/^https?:\/\//) ? candidate : `http://${candidate}`;
  return withScheme.replace(/\/$/, '');
}

/** Railway uses port 8080; local dev often 3001/3002/3003. */
const isRailway = Boolean(
  process.env['RAILWAY_ENVIRONMENT'] ?? process.env['RAILWAY_PUBLIC_DOMAIN']
);

const RAINBOT_URL = normalizeRpcBaseUrl(
  process.env['RAINBOT_URL'] || '',
  isRailway ? `http://rainbot.railway.internal:8080` : 'http://localhost:3001'
);
const PRANJEET_URL = normalizeRpcBaseUrl(
  process.env['PRANJEET_URL'] || '',
  isRailway ? `http://pranjeet.railway.internal:8080` : 'http://localhost:3002'
);
const HUNGERBOT_URL = normalizeRpcBaseUrl(
  process.env['HUNGERBOT_URL'] || '',
  isRailway ? `http://hungerbot.railway.internal:8080` : 'http://localhost:3003'
);

/** Exported for logging; used by coordinator to show which worker URLs are targeted. */
export const workerBaseUrls = {
  rainbot: RAINBOT_URL,
  pranjeet: PRANJEET_URL,
  hungerbot: HUNGERBOT_URL,
} as const;

export const rainbotClient = createTRPCClient<RainbotRouter>({
  baseUrl: RAINBOT_URL,
  secret: RPC_SECRET,
});

export const pranjeetClient = createTRPCClient<PranjeetRouter>({
  baseUrl: PRANJEET_URL,
  secret: RPC_SECRET,
});

export const hungerbotClient = createTRPCClient<HungerbotRouter>({
  baseUrl: HUNGERBOT_URL,
  secret: RPC_SECRET,
});

export async function fetchWorkerHealthChecks(): Promise<{
  rainbot: PromiseSettledResult<{ ok: boolean; service: string }>;
  pranjeet: PromiseSettledResult<{ ok: boolean; service: string }>;
  hungerbot: PromiseSettledResult<{ ok: boolean; service: string }>;
}> {
  const [rainbot, pranjeet, hungerbot] = await Promise.allSettled([
    rainbotClient.health.query(),
    pranjeetClient.health.query(),
    hungerbotClient.health.query(),
  ]);

  return {
    rainbot,
    pranjeet,
    hungerbot,
  };
}

export type WorkerBotType = 'rainbot' | 'pranjeet' | 'hungerbot';

export async function fetchWorkerState(
  botType: WorkerBotType,
  guildId?: string
): Promise<StatusResponse> {
  const input = guildId !== undefined ? { guildId } : undefined;
  switch (botType) {
    case 'rainbot':
      return rainbotClient.getState.query(input);
    case 'pranjeet':
      return pranjeetClient.getState.query(input);
    case 'hungerbot':
      return hungerbotClient.getState.query(input);
  }
}
