import { createServer, start } from './http-server.ts';
import { setClient, getClient } from './client.ts';
import type { Client } from 'npm:discord.js@14.15.3';
import { createLogger } from '../utils/logger.ts';

const log = createLogger('SERVER');

export async function createApp(): Promise<any> {
  return await createServer();
}

export async function startApp(client: Client, port = 3000): Promise<void> {
  setClient(client);
  await start(client, port);
}

export { start };

export { getClient };
