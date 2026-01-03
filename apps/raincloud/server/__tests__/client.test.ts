import type { Client } from 'discord.js';

describe('client', () => {
  beforeEach(() => {
    // Reset the client before each test
    jest.resetModules();
  });

  describe('setClient', () => {
    it('stores the Discord client', () => {
      const { setClient, getClient } = require('../client');
      const mockClient = { id: 'test-client' } as unknown as Client;

      setClient(mockClient);

      expect(getClient()).toBe(mockClient);
    });

    it('overwrites previous client', () => {
      const { setClient, getClient } = require('../client');
      const mockClient1 = { id: 'client-1' } as unknown as Client;
      const mockClient2 = { id: 'client-2' } as unknown as Client;

      setClient(mockClient1);
      setClient(mockClient2);

      expect(getClient()).toBe(mockClient2);
    });
  });

  describe('getClient', () => {
    it('returns null when no client is set', () => {
      const { getClient } = require('../client');

      expect(getClient()).toBeNull();
    });

    it('returns the stored client', () => {
      const { setClient, getClient } = require('../client');
      const mockClient = { id: 'test-client' } as unknown as Client;

      setClient(mockClient);

      expect(getClient()).toBe(mockClient);
    });
  });
});
