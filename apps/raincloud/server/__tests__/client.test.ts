/**
 * Tests for Discord client storage
 */

import { setClient, getClient } from '../client';
import type { Client } from 'discord.js';
import { assertEquals } from '@std/assert';

// Mock client
const mockClient: Client = { id: 'test-client' } as unknown as Client;

Deno.test('Discord client storage', async (t) => {
  await t.step('getClient - returns null when no client is set', () => {
    // Reset client
    setClient(null as any);
    assertEquals(getClient(), null);
  });

  await t.step('setClient and getClient - stores and returns the client', () => {
    setClient(mockClient);
    assertEquals(getClient(), mockClient);
  });

  await t.step('setClient - overwrites existing client', () => {
    const mockClient2: Client = { id: 'test-client-2' } as unknown as Client;

    setClient(mockClient);
    assertEquals(getClient(), mockClient);

    setClient(mockClient2);
    assertEquals(getClient(), mockClient2);
  });
});
