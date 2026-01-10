import { deployCommands } from '../deployCommands';
import { assertEquals, assert, assertThrows, assertRejects } from '@std/assert';

// Mock logger
jest.mock('../logger', () => ({
  createLogger: () => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    http: jest.fn(),
  }),
}));

// Mock fs - return empty to simulate no commands
jest.mock('fs', () => ({
  readdirSync: jest.fn(() => []),
  statSync: jest.fn(),
}));

// Mock discord.js REST
const mockPut = jest.fn();
const mockREST = {
  setToken: jest.fn().mockReturnThis(),
  put: mockPut,
};

jest.mock('discord.js', () => ({
  REST: jest.fn(() => mockREST),
  Routes: {
    applicationCommands: jest.fn((clientId) => `/applications/${clientId}/commands`),
    applicationGuildCommands: jest.fn(
      (clientId, guildId) => `/applications/${clientId}/guilds/${guildId}/commands`
    ),
  },
}));

// deployCommands tests
// Removed beforeEach for Deno compatibility
Deno.test('returns undefined when no commands are found', async () => {
  jest.clearAllMocks();
  mockREST.setToken.mockReturnThis();
  mockREST.put = mockPut;

  const result = await deployCommands('test-token', 'client-id', null);

  expect(result).toBeUndefined();
  expect(mockPut).not.toHaveBeenCalled();
});
Deno.test('calls deployCommands without throwing', async () => {
  jest.clearAllMocks();
  mockREST.setToken.mockReturnThis();
  mockREST.put = mockPut;

  await expect(deployCommands('test-token', 'client-id', null)).resolves.toBeUndefined();
});
Deno.test('handles different parameter combinations', async () => {
  jest.clearAllMocks();
  mockREST.setToken.mockReturnThis();
  mockREST.put = mockPut;

  // With null guildId
  await expect(deployCommands('token1', 'client1', null)).resolves.toBeUndefined();

  // With string guildId
  await expect(deployCommands('token2', 'client2', 'guild-123')).resolves.toBeUndefined();
});
