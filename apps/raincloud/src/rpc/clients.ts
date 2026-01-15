import { createTRPCClient } from '@rainbot/rpc';
import type { HungerbotRouter, PranjeetRouter, RainbotRouter } from '@rainbot/rpc';

const INTERNAL_SECRET = process.env['INTERNAL_RPC_SECRET'] || '';

const RAINBOT_URL = process.env['RAINBOT_URL'] || 'http://localhost:3001';
const PRANJEET_URL = process.env['PRANJEET_URL'] || 'http://localhost:3002';
const HUNGERBOT_URL = process.env['HUNGERBOT_URL'] || 'http://localhost:3003';

export const rainbotClient = createTRPCClient<RainbotRouter>({
  baseUrl: RAINBOT_URL,
  secret: INTERNAL_SECRET,
});

export const pranjeetClient = createTRPCClient<PranjeetRouter>({
  baseUrl: PRANJEET_URL,
  secret: INTERNAL_SECRET,
});

export const hungerbotClient = createTRPCClient<HungerbotRouter>({
  baseUrl: HUNGERBOT_URL,
  secret: INTERNAL_SECRET,
});

export async function fetchWorkerHealthChecks(): Promise<{
  rainbot: PromiseSettledResult<{ ok: true; service: string }>;
  pranjeet: PromiseSettledResult<{ ok: true; service: string }>;
  hungerbot: PromiseSettledResult<{ ok: true; service: string }>;
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
