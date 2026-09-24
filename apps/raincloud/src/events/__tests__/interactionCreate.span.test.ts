import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { AsyncHooksContextManager } from '@opentelemetry/context-async-hooks';
import { trace, context, SpanStatusCode } from '@opentelemetry/api';
import { withSpan, RainbotAttr } from '@rainbot/observability/node';

const mockTrackInteraction = jest.fn();
const mockTrackCommand = jest.fn();

jest.mock('discord.js', () => ({
  Events: { InteractionCreate: 'interactionCreate' },
  MessageFlags: { Ephemeral: 64 },
}));
jest.mock('@rainbot/utils/logger', () => ({
  createLogger: () => ({
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  }),
}));
jest.mock('@rainbot/utils/storage', () => ({
  listSounds: jest.fn(),
}));
jest.mock('@rainbot/utils/statistics', () => ({
  trackInteraction: (...args: unknown[]) => mockTrackInteraction(...args),
  trackCommand: (...args: unknown[]) => mockTrackCommand(...args),
}));
jest.mock('@rainbot/utils', () => ({
  searchSounds: jest.fn(),
}));

const { execute } = require('../interactionCreate');

const exporter = new InMemorySpanExporter();

beforeAll(() => {
  const provider = new BasicTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(exporter)],
  });
  trace.setGlobalTracerProvider(provider);

  // Production registers this via `NodeSDK.start()`. Without a real context
  // manager, `context.active()` always returns `ROOT_CONTEXT`, so a span
  // started inside `command.execute`'s callback would never be recognized as
  // a child of the active `command.execute` span — the exact bug this test
  // suite exists to catch.
  context.setGlobalContextManager(new AsyncHooksContextManager().enable());
});

beforeEach(() => {
  jest.clearAllMocks();
});

afterEach(() => exporter.reset());

interface FakeInteraction {
  id: string;
  commandName: string;
  guildId: string;
  channelId: string;
  user: { id: string; username: string; discriminator: string; tag: string };
  options: { data: unknown[] };
  replied: boolean;
  deferred: boolean;
  reply: jest.Mock;
  followUp: jest.Mock;
  client: { commands: Map<string, { execute: jest.Mock }> };
  isAutocomplete: () => boolean;
  isChatInputCommand: () => boolean;
}

function makeInteraction(commandExecute: jest.Mock): FakeInteraction {
  const commands = new Map<string, { execute: jest.Mock }>();
  commands.set('play', { execute: commandExecute });

  return {
    id: 'interaction-1',
    commandName: 'play',
    guildId: 'guild-1',
    channelId: 'channel-1',
    user: { id: 'user-1', username: 'connor', discriminator: '0001', tag: 'connor#0001' },
    options: { data: [] },
    replied: false,
    deferred: false,
    reply: jest.fn(async () => undefined),
    followUp: jest.fn(async () => undefined),
    client: { commands },
    isAutocomplete: () => false,
    isChatInputCommand: () => true,
  };
}

describe('command.execute root span', () => {
  it('creates a command.execute span carrying command name, guild id and user id', async () => {
    const interaction = makeInteraction(jest.fn(async () => undefined));

    await execute(interaction);

    const [span] = exporter.getFinishedSpans();
    expect(span).toBeDefined();
    expect(span.name).toBe('command.execute');
    expect(span.attributes[RainbotAttr.commandName]).toBe('play');
    expect(span.attributes[RainbotAttr.guildId]).toBe('guild-1');
    expect(span.attributes[RainbotAttr.userId]).toBe('user-1');
    expect(span.status.code).toBe(SpanStatusCode.UNSET);
  });

  it('marks the span ERROR and propagates the original error instance when the command throws', async () => {
    const originalError = new Error('play blew up');
    const commandExecute = jest.fn(async () => {
      throw originalError;
    });
    const interaction = makeInteraction(commandExecute);

    // interactionCreate's own execute() swallows the error (logs, tracks
    // stats, replies) rather than rethrowing — that behaviour must not
    // change, so this must resolve, not reject.
    await expect(execute(interaction)).resolves.toBeUndefined();

    const [span] = exporter.getFinishedSpans();
    expect(span.name).toBe('command.execute');
    expect(span.status.code).toBe(SpanStatusCode.ERROR);

    // The same original error instance must have reached the existing
    // error-tracking and reply path unchanged.
    expect(mockTrackCommand).toHaveBeenCalledWith(
      'play',
      'user-1',
      'guild-1',
      'discord',
      false,
      originalError.message,
      'connor',
      '0001'
    );
    expect(interaction.reply).toHaveBeenCalledWith({
      content: 'There was an error while executing this command!',
      flags: 64,
    });
  });

  it('parents a span created during command execution under command.execute, sharing its trace id', async () => {
    const commandExecute = jest.fn(async () => {
      // Stand-in for the downstream `worker.rpc` span
      // (packages/rpc/src/client.ts) that a real command triggers via the
      // tRPC client — proves trace connectivity end-to-end, not just that a
      // root span exists.
      await withSpan('worker.rpc', {}, async () => 'ok');
    });
    const interaction = makeInteraction(commandExecute);

    await execute(interaction);

    const spans = exporter.getFinishedSpans();
    const root = spans.find((s) => s.name === 'command.execute');
    const child = spans.find((s) => s.name === 'worker.rpc');
    expect(root).toBeDefined();
    expect(child).toBeDefined();

    expect(child!.spanContext().traceId).toBe(root!.spanContext().traceId);
    expect(child!.parentSpanContext?.spanId).toBe(root!.spanContext().spanId);
  });
});
