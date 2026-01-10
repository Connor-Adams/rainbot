import type { Client } from 'discord.js';
import { createLogger } from '../utils/logger.ts';
import { setClient, getClient } from './client.ts';
import { RainbotHTTPServer } from '../apps/raincloud/server/http-server.ts';
import type { AppConfig } from '../types/server.ts';
import process from 'node:process';

const log = createLogger('SERVER');

let cachedConfig: AppConfig | null = null;

export async function createServer(): Promise<RainbotHTTPServer> {
  const { loadConfig } = await import('../utils/config.ts');

  const config: AppConfig = loadConfig() as any;
  const server = new RainbotHTTPServer(config);

  return server;
}

export async function startService(client: Client, port = 3000): Promise<void> {
  setClient(client);
  const server = await createServer();

  // Railway and other platforms use 0.0.0.0 instead of localhost
  const host = process.env['HOST'] || '0.0.0.0';
  await server.start(port);
  const url = config.railwayPublicDomain
    ? `https://${config.railwayPublicDomain}`
    : `http://${host}:${port}`;

  log.info(`Dashboard running at ${url}`);
}

export { getClient };
