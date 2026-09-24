import type { Client } from 'discord.js';

type ClientGetter = () => Client | null;

let clientGetter: ClientGetter | null = null;

/**
 * Inject the source of the Discord client. Hosts that consume @rainbot/utils
 * MUST call this once their client is constructed (e.g. apps/raincloud/index.js
 * calls it after server.setClient). Without it getDiscordClient returns null.
 */
export function setDiscordClientGetter(getter: ClientGetter): void {
  clientGetter = getter;
}

export function getDiscordClient(): Client | null {
  return clientGetter ? clientGetter() : null;
}
