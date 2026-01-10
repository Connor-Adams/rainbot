import type { Client } from 'discord.js';
import { createLogger } from '../utils/logger.ts';
import { setClient, getClient } from './client.ts';
import { RainbotHTTPServer } from '../apps/raincloud/server/http-server.ts';
import type { AppConfig } from '../types/server.ts';

const log = createLogger('SERVER');

export async function createServer(): Promise<RainbotHTTPServer> {
  const { loadConfig } = require('../utils/config');
  const config: AppConfig = loadConfig();

  const server = new RainbotHTTPServer(config);

  return server;
}

export async function start(client: Client, port = 3000): Promise<RainbotHTTPServer> {
  setClient(client);
  const server = await createServer();
  const { loadConfig } = require('../utils/config');
  const config: AppConfig = loadConfig();

  // Railway and other platforms use 0.0.0.0 instead of localhost
  const host = process.env['HOST'] || '0.0.0.0';

  await server.start(port);

  const url = config.railwayPublicDomain
    ? `https://${config.railwayPublicDomain}`
    : `http://${host}:${port}`;
  log.info(`Dashboard running at ${url}`);

  return server;
}

export { getClient };
