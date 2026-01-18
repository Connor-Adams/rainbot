/**
 * Centralized Discord client storage to avoid circular dependencies
 */
import type { Client } from 'discord.js';

let discordClient: Client | null = null;

export function setClient(client: Client): void {
  discordClient = client;
}

export function getClient(): Client | null {
  return discordClient;
}
