import type { Client } from 'discord.js';
import { assertEquals, assert, assertThrows, assertRejects } from '@std/assert';

// client tests
Deno.test('client - setClient stores the Discord client', () => {
  // Import fresh module for each test
  const { setClient, getClient } = require('../client');
  const mockClient = { id: 'test-client' } as unknown as Client;

  setClient(mockClient);

  assertEquals(getClient(), mockClient);
});

Deno.test('client - setClient overwrites previous client', () => {
  const { setClient, getClient } = require('../client');
  const mockClient1 = { id: 'client-1' } as unknown as Client;
  const mockClient2 = { id: 'client-2' } as unknown as Client;

  setClient(mockClient1);
  setClient(mockClient2);

  assertEquals(getClient(), mockClient2);
});

Deno.test('client - getClient returns null when no client is set', () => {
  const { getClient } = require('../client');

  assertEquals(getClient(), null);
});

Deno.test('client - getClient returns the stored client', () => {
  const { setClient, getClient } = require('../client');
  const mockClient = { id: 'test-client' } as unknown as Client;

  setClient(mockClient);

  assertEquals(getClient(), mockClient);
});
