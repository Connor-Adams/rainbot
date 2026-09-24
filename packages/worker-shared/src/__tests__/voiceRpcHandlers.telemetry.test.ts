import { EventEmitter } from 'events';
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { trace, SpanStatusCode } from '@opentelemetry/api';
import { RainbotAttr } from '@rainbot/observability/node';

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

import { VoiceConnectionStatus } from '@discordjs/voice';
import { createJoinHandler, createLeaveHandler } from '../voiceRpcHandlers';
import { markVoiceConnected, markVoiceDisconnected } from '../voiceConnectionMetrics';
import type { GuildState } from '../voice-state';

class FakeConnection extends EventEmitter {
  state = { status: 'ready' };
  subscribe = jest.fn();
  destroy = jest.fn();
}

const exporter = new InMemorySpanExporter();

beforeAll(() => {
  trace.setGlobalTracerProvider(
    new BasicTracerProvider({ spanProcessors: [new SimpleSpanProcessor(exporter)] })
  );
});

beforeEach(() => {
  exporter.reset();
  jest.clearAllMocks();
});

function findJoinSpan() {
  return exporter.getFinishedSpans().find((s) => s.name === 'voice.join');
}

function buildJoinHandler() {
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
  const log = { warn: jest.fn(), info: jest.fn(), debug: jest.fn(), error: jest.fn() };

  const handler = createJoinHandler({
    client: client as never,
    requestCache: new Map() as never,
    getOrCreateGuildState: () => state,
    guildStates: new Map(),
    log: log as never,
  });

  return { handler, connection, state, log };
}

describe('createJoinHandler telemetry', () => {
  it('spans voice.join and counts the connection on a successful join', async () => {
    const { handler, connection } = buildJoinHandler();

    const response = await handler({
      requestId: 'r1',
      guildId: 'guild-1',
      channelId: 'channel-1',
    } as never);

    expect(response).toEqual({ status: 'joined', channelId: 'channel-1' });
    expect(markVoiceConnected).toHaveBeenCalledWith(connection, 'guild-1');

    const span = findJoinSpan();
    expect(span).toBeDefined();
    expect(span!.attributes[RainbotAttr.guildId]).toBe('guild-1');
    expect(span!.attributes[RainbotAttr.voiceChannel]).toBe('channel-1');
    expect(span!.status.code).toBe(SpanStatusCode.UNSET);
  });

  it('uncounts the connection when its error listener tears it down', async () => {
    const { handler, connection } = buildJoinHandler();
    await handler({ requestId: 'r1', guildId: 'guild-1', channelId: 'channel-1' } as never);
    (markVoiceDisconnected as jest.Mock).mockClear();

    connection.emit('error', new Error('Unexpected server response: 521'));

    expect(markVoiceDisconnected).toHaveBeenCalledWith(connection, 'guild-1');
  });

  it('uncounts the connection when a Disconnected rejoin attempt fails', async () => {
    jest.useFakeTimers();
    try {
      const { handler, connection } = buildJoinHandler();
      await handler({ requestId: 'r1', guildId: 'guild-1', channelId: 'channel-1' } as never);
      (markVoiceDisconnected as jest.Mock).mockClear();

      // Neither Signalling nor Connecting is reached, so the listener's
      // internal 5s-per-branch entersState() race rejects on timeout and it
      // gives up and destroys the connection. Advance fake timers instead of
      // waiting out 5s of real time.
      connection.emit(VoiceConnectionStatus.Disconnected);
      await jest.advanceTimersByTimeAsync(5_100);

      expect(connection.destroy).toHaveBeenCalled();
      expect(markVoiceDisconnected).toHaveBeenCalledWith(connection, 'guild-1');
    } finally {
      jest.useRealTimers();
    }
  });

  it('does not span or count an already-connected response', async () => {
    const { handler, state } = buildJoinHandler();
    state.connection = { state: { status: 'ready' } } as never;

    const response = await handler({
      requestId: 'r1',
      guildId: 'guild-1',
      channelId: 'channel-1',
    } as never);

    expect(response).toEqual({ status: 'already_connected', channelId: 'channel-1' });
    expect(markVoiceConnected).not.toHaveBeenCalled();
    expect(findJoinSpan()).toBeUndefined();
  });
});

describe('createLeaveHandler telemetry', () => {
  it('uncounts the connection on an explicit leave', async () => {
    const connection = new FakeConnection();
    const state = { player: new EventEmitter(), connection } as unknown as GuildState;
    const guildStates = new Map([['guild-1', state]]);

    const handler = createLeaveHandler({
      requestCache: new Map() as never,
      guildStates,
    } as never);

    const response = await handler({ requestId: 'r1', guildId: 'guild-1' } as never);

    expect(response).toEqual({ status: 'left' });
    expect(connection.destroy).toHaveBeenCalled();
    expect(markVoiceDisconnected).toHaveBeenCalledWith(connection, 'guild-1');
  });

  it('is a no-op (no double-decrement) when there is nothing to leave', async () => {
    const guildStates = new Map<string, GuildState>();
    const handler = createLeaveHandler({
      requestCache: new Map() as never,
      guildStates,
    } as never);

    const response = await handler({ requestId: 'r1', guildId: 'guild-1' } as never);

    expect(response).toEqual({ status: 'not_connected' });
    expect(markVoiceDisconnected).not.toHaveBeenCalled();
  });
});
