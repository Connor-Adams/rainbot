import type { Client } from 'discord.js';

type ClientGetter = () => Client | null;

let clientGetter: ClientGetter | null = null;

export function setDiscordClientGetter(getter: ClientGetter): void {
  clientGetter = getter;
}

export function getDiscordClient(): Client | null {
  if (clientGetter) {
    return clientGetter();
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const serverClient = require('../../server/client') as { getClient?: ClientGetter };
    if (serverClient?.getClient) {
      return serverClient.getClient();
    }
  } catch {
    // Ignore and try next fallback.
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const raincloudClient = require('../../apps/raincloud/server/client') as {
      getClient?: ClientGetter;
    };
    if (raincloudClient?.getClient) {
      return raincloudClient.getClient();
    }
  } catch {
    // Ignore and fall through.
  }

  return null;
}
