import { EventEmitter } from 'events';

const joinVoiceChannel = jest.fn();

jest.mock('@discordjs/voice', () => {
  const actual = jest.requireActual('@discordjs/voice');
  return {
    ...actual,
    joinVoiceChannel: (...args: unknown[]) => joinVoiceChannel(...args),
  };
});

import { createJoinHandler } from '../voiceRpcHandlers';
import type { GuildState } from '../voice-state';

class FakeConnection extends EventEmitter {
  state = { status: 'ready' };
  subscribe = jest.fn();
  destroy = jest.fn();
}

function buildHandler() {
  const connection = new FakeConnection();
  joinVoiceChannel.mockReturnValue(connection);

  const channel = { id: 'channel-1', isVoiceBased: () => true };
  const guild = {
    id: 'guild-1',
    channels: { cache: new Map([['channel-1', channel]]) },
    voiceAdapterCreator: jest.fn(),
  };
  const client = {
    isReady: () => true,
    guilds: { cache: new Map([['guild-1', guild]]) },
  };
  const state = { player: new EventEmitter(), connection: null } as unknown as GuildState;
  const warn = jest.fn();

  const handler = createJoinHandler({
    client: client as never,
    requestCache: new Map() as never,
    getOrCreateGuildState: () => state,
    guildStates: new Map(),
    log: { warn, info: jest.fn(), debug: jest.fn(), error: jest.fn() } as never,
  });

  return { handler, connection, warn };
}

describe('createJoinHandler', () => {
  it('handles voice connection errors instead of crashing the worker', async () => {
    const { handler, connection, warn } = buildHandler();

    await handler({ requestId: 'r1', guildId: 'guild-1', channelId: 'channel-1' } as never);

    expect(() =>
      connection.emit('error', new Error('Unexpected server response: 521'))
    ).not.toThrow();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Unexpected server response: 521'));
  });
});
