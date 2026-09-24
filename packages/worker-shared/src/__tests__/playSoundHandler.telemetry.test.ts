import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { trace, context, SpanStatusCode } from '@opentelemetry/api';
import { AsyncHooksContextManager } from '@opentelemetry/context-async-hooks';
import { RainbotAttr } from '@rainbot/observability/node';
import { StreamType } from '@discordjs/voice';

jest.mock('@discordjs/voice', () => ({
  ...jest.requireActual('@discordjs/voice'),
  createAudioResource: jest.fn(() => ({ volume: { setVolume: jest.fn() } })),
}));

jest.mock('@rainbot/observability/node', () => ({
  ...jest.requireActual('@rainbot/observability/node'),
  recordSoundPlay: jest.fn(),
}));

import { recordSoundPlay } from '@rainbot/observability/node';
import { createPlaySoundHandler } from '../voiceRpcHandlers';
import type { GuildState } from '../voice-state';

const exporter = new InMemorySpanExporter();

beforeAll(() => {
  trace.setGlobalTracerProvider(
    new BasicTracerProvider({ spanProcessors: [new SimpleSpanProcessor(exporter)] })
  );
  // Production registers a real context manager via `NodeSDK.start()`
  // (`@rainbot/observability`'s `startTelemetry`). Without one,
  // `context.active()` always returns `ROOT_CONTEXT` and
  // `trace.getActiveSpan()` inside the sound.play handler's withSpan
  // callback — used to mark the span ERROR on a resolve-with-failure-value —
  // would silently find nothing across the `await` boundaries in this test.
  context.setGlobalContextManager(new AsyncHooksContextManager().enable());
});

beforeEach(() => {
  exporter.reset();
  jest.clearAllMocks();
});

function findSpan() {
  return exporter.getFinishedSpans().find((s) => s.name === 'sound.play');
}

function fakeLog() {
  return { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
}

describe('createPlaySoundHandler telemetry', () => {
  it('spans sound.play, times the play phase separately, and stays UNSET on success', async () => {
    const player = { stop: jest.fn(), play: jest.fn(), state: { status: 'idle' } };
    const state = {
      connection: { state: { status: 'ready' } },
      player,
      volume: 1,
    } as unknown as GuildState;

    const handler = createPlaySoundHandler({
      requestCache: new Map() as never,
      log: fakeLog() as never,
      getOrCreateGuildState: () => state,
      createSoundResource: async () => ({
        stream: {} as never,
        inputType: StreamType.Arbitrary,
      }),
    });

    const response = await handler({
      requestId: 'r1',
      guildId: 'guild-1',
      userId: 'user-1',
      sfxId: 'airhorn',
    });

    expect(response).toEqual({ status: 'success', message: 'Sound playing' });
    expect(player.play).toHaveBeenCalled();
    expect(recordSoundPlay).toHaveBeenCalledWith(expect.any(Number), {
      [RainbotAttr.sound]: 'airhorn',
      [RainbotAttr.phase]: 'play',
    });

    const span = findSpan();
    expect(span).toBeDefined();
    expect(span!.attributes[RainbotAttr.sound]).toBe('airhorn');
    expect(span!.attributes[RainbotAttr.guildId]).toBe('guild-1');
    expect(span!.status.code).toBe(SpanStatusCode.UNSET);
  });

  it('marks the span ERROR when not connected, even though the handler resolves normally (no throw)', async () => {
    const state = {
      connection: null,
      player: { stop: jest.fn(), play: jest.fn() },
    } as unknown as GuildState;

    const handler = createPlaySoundHandler({
      requestCache: new Map() as never,
      log: fakeLog() as never,
      getOrCreateGuildState: () => state,
      createSoundResource: async () => ({
        stream: {} as never,
        inputType: StreamType.Arbitrary,
      }),
    });

    const response = await handler({
      requestId: 'r1',
      guildId: 'guild-1',
      userId: 'user-1',
      sfxId: 'airhorn',
    });

    expect(response).toEqual({ status: 'error', message: 'Not connected to voice channel' });
    const span = findSpan();
    expect(span).toBeDefined();
    expect(span!.status.code).toBe(SpanStatusCode.ERROR);
    expect(recordSoundPlay).not.toHaveBeenCalled();
  });

  it('marks the span ERROR when createSoundResource throws, and still resolves an error response instead of crashing', async () => {
    const state = {
      connection: { state: { status: 'ready' } },
      player: { stop: jest.fn(), play: jest.fn() },
    } as unknown as GuildState;
    const boom = new Error('sound not found');

    const handler = createPlaySoundHandler({
      requestCache: new Map() as never,
      log: fakeLog() as never,
      getOrCreateGuildState: () => state,
      createSoundResource: async () => {
        throw boom;
      },
    });

    const response = await handler({
      requestId: 'r1',
      guildId: 'guild-1',
      userId: 'user-1',
      sfxId: 'airhorn',
    });

    expect(response).toEqual({ status: 'error', message: 'sound not found' });
    const span = findSpan();
    expect(span).toBeDefined();
    expect(span!.status.code).toBe(SpanStatusCode.ERROR);
    expect(span!.events.map((e) => e.name)).toContain('exception');
  });
});
