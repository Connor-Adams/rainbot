import { deployCommands } from '../deployCommands';

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

describe('deployCommands', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockREST.setToken.mockReturnThis();
    mockREST.put = mockPut;
  });

  it('returns undefined when no commands are found', async () => {
    const result = await deployCommands('test-token', 'client-id', null);

    expect(result).toBeUndefined();
    expect(mockPut).not.toHaveBeenCalled();
  });

  it('calls deployCommands without throwing', async () => {
    await expect(deployCommands('test-token', 'client-id', null)).resolves.toBeUndefined();
  });

  it('handles different parameter combinations', async () => {
    // With null guildId
    await expect(deployCommands('token1', 'client1', null)).resolves.toBeUndefined();

    // With string guildId
    await expect(deployCommands('token2', 'client2', 'guild-123')).resolves.toBeUndefined();
  });
});
