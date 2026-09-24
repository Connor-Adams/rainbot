import { EventEmitter } from 'events';
import { Events } from 'discord.js';

const joinVoiceChannel = jest.fn();

jest.mock('@discordjs/voice', () => {
  const actual = jest.requireActual('@discordjs/voice');
  return {
    ...actual,
    joinVoiceChannel: (...args: unknown[]) => joinVoiceChannel(...args),
  };
});

jest.mock('../voiceConnectionMetrics', () => ({
  markVoiceConnected: jest.fn(),
  markVoiceDisconnected: jest.fn(),
}));

import { setupAutoFollowVoiceStateHandler } from '../voice-state';
import { markVoiceDisconnected } from '../voiceConnectionMetrics';
import type { GuildState } from '../voice-state';

class FakeConnection extends EventEmitter {
  state = { status: 'ready' };
  joinConfig = { channelId: 'chan-2' };
  subscribe = jest.fn();
  destroy = jest.fn();
}

function fakeClient() {
  const emitter = new EventEmitter() as EventEmitter & { guilds: { cache: Map<string, unknown> } };
  emitter.guilds = { cache: new Map() };
  return emitter;
}

function fakePlayer() {
  return Object.assign(new EventEmitter(), { state: { status: 'idle' } });
}

async function flush() {
  await new Promise((resolve) => setImmediate(resolve));
}

describe('setupAutoFollowVoiceStateHandler error handling', () => {
  beforeEach(() => jest.clearAllMocks());

  it('does not let a connection error propagate as an unhandled exception, and decrements the gauge exactly once', async () => {
    const client = fakeClient();
    const connection = new FakeConnection();
    joinVoiceChannel.mockReturnValue(connection);

    const state = { connection: null, player: fakePlayer() } as unknown as GuildState;
    const guildStates = new Map([['guild-1', state]]);
    const channel = { id: 'chan-2', isVoiceBased: () => true };
    const guild = {
      id: 'guild-1',
      channels: { cache: new Map([['chan-2', channel]]) },
      voiceAdapterCreator: jest.fn(),
    };
    client.guilds.cache.set('guild-1', guild);

    const logger = { warn: jest.fn(), info: jest.fn(), debug: jest.fn(), error: jest.fn() };

    setupAutoFollowVoiceStateHandler(client as never, {
      orchestratorBotId: 'orch-bot',
      guildStates,
      getOrCreateGuildState: () => state,
      logger: logger as never,
    });

    const oldState = { member: { id: 'orch-bot' }, guild: { id: 'guild-1' }, channelId: null };
    const newState = { member: { id: 'orch-bot' }, guild: { id: 'guild-1' }, channelId: 'chan-2' };
    client.emit(Events.VoiceStateUpdate, oldState, newState);
    await flush();

    expect(() =>
      connection.emit('error', new Error('Unexpected server response: 521'))
    ).not.toThrow();

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Unexpected server response: 521')
    );
    expect(connection.destroy).toHaveBeenCalledTimes(1);
    expect(markVoiceDisconnected).toHaveBeenCalledTimes(1);
    expect(markVoiceDisconnected).toHaveBeenCalledWith(connection, 'guild-1');
    expect(state.connection).toBeNull();
  });
});
