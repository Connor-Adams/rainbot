import type { Client, Guild, GuildMember, Collection } from 'discord.js';
import { verifyUserRole } from '../roleVerifier';
import { assertEquals, assert, assertThrows, assertRejects } from '@std/assert';

// Mock the logger
jest.mock('../../../utils/logger', () => ({
  createLogger: () => ({
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    http: jest.fn(),
  }),
}));

// roleVerifier tests
{
  // verifyUserRole tests
  let mockClient: Partial<Client>;
  let mockGuild: Partial<Guild>;
  let mockMember: Partial<GuildMember>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockMember = {
      roles: {
        cache: new Map([
          ['role1', {} as never],
          ['role2', {} as never],
          ['test-role-id', {} as never],
        ]) as unknown as Collection<string, unknown>,
      } as never,
    };

    mockGuild = {
      id: 'guild1',
      name: 'Test Guild',
      members: {
        fetch: jest.fn().mockResolvedValue(mockMember),
      } as never,
    };

    mockClient = {
      isReady: jest.fn(() => true),
      guilds: {
        cache: new Map([['guild1', mockGuild as Guild]]) as Collection<string, Guild>,
      } as never,
    };
  });

  Deno.test('returns true when user has the required role', async () => {
    const result = await verifyUserRole('user1', 'test-role-id', mockClient as Client);

    assertEquals(result, true);
  });

  Deno.test('returns false when user does not have the required role', async () => {
    const result = await verifyUserRole('user1', 'missing-role-id', mockClient as Client);

    assertEquals(result, false);
  });

  Deno.test('returns false when bot client is null', async () => {
    const result = await verifyUserRole('user1', 'test-role-id', null);

    assertEquals(result, false);
  });

  Deno.test('returns false when bot client is not ready', async () => {
    mockClient.isReady = jest.fn(() => false);

    const result = await verifyUserRole('user1', 'test-role-id', mockClient as Client);

    assertEquals(result, false);
  });

  Deno.test('returns false when userId is empty', async () => {
    const result = await verifyUserRole('', 'test-role-id', mockClient as Client);

    assertEquals(result, false);
  });

  Deno.test('returns false when requiredRoleId is empty', async () => {
    const result = await verifyUserRole('user1', '', mockClient as Client);

    assertEquals(result, false);
  });

  Deno.test('checks multiple guilds when user is not in the first guild', async () => {
    const mockGuild2: Partial<Guild> = {
      id: 'guild2',
      name: 'Test Guild 2',
      members: {
        fetch: jest.fn().mockResolvedValue(mockMember),
      } as never,
    };

    const mockGuild1NoMember: Partial<Guild> = {
      id: 'guild1',
      name: 'Test Guild 1',
      members: {
        fetch: jest.fn().mockRejectedValue(new Error('User not in guild')),
      } as never,
    };

    mockClient.guilds = {
      cache: new Map([
        ['guild1', mockGuild1NoMember as Guild],
        ['guild2', mockGuild2 as Guild],
      ]) as Collection<string, Guild>,
    } as never;

    const result = await verifyUserRole('user1', 'test-role-id', mockClient as Client);

    assertEquals(result, true);
    expect(mockGuild1NoMember.members?.fetch).toHaveBeenCalledWith('user1');
    expect(mockGuild2.members?.fetch).toHaveBeenCalledWith('user1');
  });

  Deno.test('returns false when user is not in any guild', async () => {
    mockGuild.members = {
      fetch: jest.fn().mockRejectedValue(new Error('User not found')),
    } as never;

    const result = await verifyUserRole('user1', 'test-role-id', mockClient as Client);

    assertEquals(result, false);
  });

  Deno.test('returns false when member fetch returns null', async () => {
    mockGuild.members = {
      fetch: jest.fn().mockResolvedValue(null),
    } as never;

    const result = await verifyUserRole('user1', 'test-role-id', mockClient as Client);

    assertEquals(result, false);
  });

  Deno.test('handles errors gracefully and returns false', async () => {
    mockClient.guilds = {
      cache: {
        // eslint-disable-next-line require-yield
        [Symbol.iterator]: function* () {
          throw new Error('Unexpected error');
        },
      } as unknown as Collection<string, Guild>,
    } as never;

    const result = await verifyUserRole('user1', 'test-role-id', mockClient as Client);

    assertEquals(result, false);
  });

  Deno.test('returns true as soon as role is found in any guild', async () => {
    const mockGuild1: Partial<Guild> = {
      id: 'guild1',
      name: 'Test Guild 1',
      members: {
        fetch: jest.fn().mockResolvedValue({
          roles: {
            cache: new Map([['other-role', {} as never]]),
          },
        }),
      } as never,
    };

    const mockGuild2: Partial<Guild> = {
      id: 'guild2',
      name: 'Test Guild 2',
      members: {
        fetch: jest.fn().mockResolvedValue({
          roles: {
            cache: new Map([['test-role-id', {} as never]]),
          },
        }),
      } as never,
    };

    const mockGuild3: Partial<Guild> = {
      id: 'guild3',
      name: 'Test Guild 3',
      members: {
        fetch: jest.fn(),
      } as never,
    };

    mockClient.guilds = {
      cache: new Map([
        ['guild1', mockGuild1 as Guild],
        ['guild2', mockGuild2 as Guild],
        ['guild3', mockGuild3 as Guild],
      ]) as Collection<string, Guild>,
    } as never;

    const result = await verifyUserRole('user1', 'test-role-id', mockClient as Client);

    assertEquals(result, true);
    expect(mockGuild1.members?.fetch).toHaveBeenCalled();
    expect(mockGuild2.members?.fetch).toHaveBeenCalled();
    // Should not check guild3 as role was found in guild2
    expect(mockGuild3.members?.fetch).not.toHaveBeenCalled();
  });

  Deno.test('continues checking guilds when member fetch fails', async () => {
    const mockGuild1: Partial<Guild> = {
      id: 'guild1',
      name: 'Test Guild 1',
      members: {
        fetch: jest.fn().mockRejectedValue(new Error('Fetch failed')),
      } as never,
    };

    const mockGuild2: Partial<Guild> = {
      id: 'guild2',
      name: 'Test Guild 2',
      members: {
        fetch: jest.fn().mockResolvedValue({
          roles: {
            cache: new Map([['test-role-id', {} as never]]),
          },
        }),
      } as never,
    };

    mockClient.guilds = {
      cache: new Map([
        ['guild1', mockGuild1 as Guild],
        ['guild2', mockGuild2 as Guild],
      ]) as Collection<string, Guild>,
    } as never;

    const result = await verifyUserRole('user1', 'test-role-id', mockClient as Client);

    assertEquals(result, true);
    expect(mockGuild1.members?.fetch).toHaveBeenCalled();
    expect(mockGuild2.members?.fetch).toHaveBeenCalled();
  });
}
