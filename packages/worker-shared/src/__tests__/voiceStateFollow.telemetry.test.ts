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
import { markVoiceConnected, markVoiceDisconnected } from '../voiceConnectionMetrics';
import type { GuildState } from '../voice-state';

class FakeConnection extends EventEmitter {
  state = { status: 'ready' };
  joinConfig = { channelId: 'chan-1' };
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

describe('setupAutoFollowVoiceStateHandler telemetry (second connect/disconnect path)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('uncounts the connection when the orchestrator leaves voice', async () => {
    const client = fakeClient();
    const connection = new FakeConnection();
    const state = { connection, player: fakePlayer() } as unknown as GuildState;
    const guildStates = new Map([['guild-1', state]]);

    setupAutoFollowVoiceStateHandler(client as never, {
      orchestratorBotId: 'orch-bot',
      guildStates,
      getOrCreateGuildState: () => state,
    });

    const oldState = { member: { id: 'orch-bot' }, guild: { id: 'guild-1' }, channelId: 'chan-1' };
    const newState = { member: { id: 'orch-bot' }, guild: { id: 'guild-1' }, channelId: null };
    client.emit(Events.VoiceStateUpdate, oldState, newState);
    await flush();

    expect(connection.destroy).toHaveBeenCalled();
    expect(markVoiceDisconnected).toHaveBeenCalledWith(connection, 'guild-1');
  });

  it('counts the new connection and uncounts the old one when following the orchestrator to a new channel', async () => {
    const client = fakeClient();
    const oldConnection = new FakeConnection();
    const newConnection = new FakeConnection();
    joinVoiceChannel.mockReturnValue(newConnection);

    const state = {
      connection: oldConnection,
      player: fakePlayer(),
    } as unknown as GuildState;
    const guildStates = new Map([['guild-1', state]]);
    const channel = { id: 'chan-2', isVoiceBased: () => true };
    const guild = {
      id: 'guild-1',
      channels: { cache: new Map([['chan-2', channel]]) },
      voiceAdapterCreator: jest.fn(),
    };
    client.guilds.cache.set('guild-1', guild);

    setupAutoFollowVoiceStateHandler(client as never, {
      orchestratorBotId: 'orch-bot',
      guildStates,
      getOrCreateGuildState: () => state,
    });

    const oldState = { member: { id: 'orch-bot' }, guild: { id: 'guild-1' }, channelId: 'chan-1' };
    const newState = { member: { id: 'orch-bot' }, guild: { id: 'guild-1' }, channelId: 'chan-2' };
    client.emit(Events.VoiceStateUpdate, oldState, newState);
    await flush();

    expect(markVoiceDisconnected).toHaveBeenCalledWith(oldConnection, 'guild-1');
    expect(markVoiceConnected).toHaveBeenCalledWith(newConnection, 'guild-1');
  });

  it('counts a fresh follow-join with no prior connection', async () => {
    const client = fakeClient();
    const newConnection = new FakeConnection();
    joinVoiceChannel.mockReturnValue(newConnection);

    const state = { connection: null, player: fakePlayer() } as unknown as GuildState;
    const guildStates = new Map([['guild-1', state]]);
    const channel = { id: 'chan-2', isVoiceBased: () => true };
    const guild = {
      id: 'guild-1',
      channels: { cache: new Map([['chan-2', channel]]) },
      voiceAdapterCreator: jest.fn(),
    };
    client.guilds.cache.set('guild-1', guild);

    setupAutoFollowVoiceStateHandler(client as never, {
      orchestratorBotId: 'orch-bot',
      guildStates,
      getOrCreateGuildState: () => state,
    });

    const oldState = { member: { id: 'orch-bot' }, guild: { id: 'guild-1' }, channelId: null };
    const newState = { member: { id: 'orch-bot' }, guild: { id: 'guild-1' }, channelId: 'chan-2' };
    client.emit(Events.VoiceStateUpdate, oldState, newState);
    await flush();

    expect(markVoiceDisconnected).not.toHaveBeenCalled();
    expect(markVoiceConnected).toHaveBeenCalledWith(newConnection, 'guild-1');
  });

  // F7: this path had the same bug as voiceRpcHandlers.ts's join handler —
  // markVoiceConnected fired right after joinVoiceChannel() returns
  // (synchronously in `Signalling`), counting attempts rather than
  // established connections. It now waits for Ready first.
  it('does not count a follow-join until the connection reaches ready', async () => {
    const client = fakeClient();
    const newConnection = new FakeConnection();
    newConnection.state = { status: 'signalling' };
    joinVoiceChannel.mockReturnValue(newConnection);

    const state = { connection: null, player: fakePlayer() } as unknown as GuildState;
    const guildStates = new Map([['guild-1', state]]);
    const channel = { id: 'chan-2', isVoiceBased: () => true };
    const guild = {
      id: 'guild-1',
      channels: { cache: new Map([['chan-2', channel]]) },
      voiceAdapterCreator: jest.fn(),
    };
    client.guilds.cache.set('guild-1', guild);

    setupAutoFollowVoiceStateHandler(client as never, {
      orchestratorBotId: 'orch-bot',
      guildStates,
      getOrCreateGuildState: () => state,
    });

    const oldState = { member: { id: 'orch-bot' }, guild: { id: 'guild-1' }, channelId: null };
    const newState = {
      member: { id: 'orch-bot' },
      guild: { id: 'guild-1' },
      channelId: 'chan-2',
    };
    client.emit(Events.VoiceStateUpdate, oldState, newState);
    await flush();

    expect(markVoiceConnected).not.toHaveBeenCalled();

    newConnection.state = { status: 'ready' };
    newConnection.emit('ready');
    await flush();

    expect(markVoiceConnected).toHaveBeenCalledWith(newConnection, 'guild-1');
  });

  it('ignores voice state updates for members other than the orchestrator bot', async () => {
    const client = fakeClient();
    const state = { connection: null, player: fakePlayer() } as unknown as GuildState;
    const guildStates = new Map([['guild-1', state]]);

    setupAutoFollowVoiceStateHandler(client as never, {
      orchestratorBotId: 'orch-bot',
      guildStates,
      getOrCreateGuildState: () => state,
    });

    const oldState = { member: { id: 'someone-else' }, guild: { id: 'guild-1' }, channelId: null };
    const newState = {
      member: { id: 'someone-else' },
      guild: { id: 'guild-1' },
      channelId: 'chan-2',
    };
    client.emit(Events.VoiceStateUpdate, oldState, newState);
    await flush();

    expect(markVoiceConnected).not.toHaveBeenCalled();
    expect(markVoiceDisconnected).not.toHaveBeenCalled();
  });
});
