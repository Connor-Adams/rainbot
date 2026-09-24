import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { trace, context, SpanStatusCode } from '@opentelemetry/api';
import { AsyncHooksContextManager } from '@opentelemetry/context-async-hooks';
import { RainbotAttr } from '@rainbot/observability/node';

jest.mock('../../config', () => ({
  GROK_API_KEY: 'test-key',
  GROK_MODEL: 'grok-test-model',
  GROK_ENABLED: true,
}));

jest.mock('../../redis', () => ({
  getGrokHistory: jest.fn(() => Promise.resolve([])),
  appendGrokHistory: jest.fn(() => Promise.resolve()),
  clearGrokHistory: jest.fn(() => Promise.resolve()),
}));

jest.mock('../../prompts', () => ({
  getSystemPromptForChat: jest.fn(() => Promise.resolve('system prompt')),
}));

import { appendGrokHistory } from '../../redis';
import { getGrokReply } from '../grok';

const exporter = new InMemorySpanExporter();

beforeAll(() => {
  trace.setGlobalTracerProvider(
    new BasicTracerProvider({ spanProcessors: [new SimpleSpanProcessor(exporter)] })
  );
  // Without a real context manager, trace.getActiveSpan() inside the
  // grok.chat.completion withSpan callback (used to mark the span ERROR on a
  // resolve-with-failure-value, and to record token-count attributes) would
  // silently find nothing across the `await fetch(...)` boundary. Production
  // registers one via `startTelemetry()`.
  context.setGlobalContextManager(new AsyncHooksContextManager().enable());
});

const originalFetch = global.fetch;

beforeEach(() => {
  exporter.reset();
  jest.clearAllMocks();
});

afterEach(() => {
  global.fetch = originalFetch;
});

function findSpan() {
  return exporter.getFinishedSpans().find((s) => s.name === 'grok.chat.completion');
}

describe('getGrokReply grok.chat.completion span', () => {
  it('spans a successful reply with the model and guild attributes, UNSET status', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { role: 'assistant', content: 'Hi there!' } }] }),
    }) as unknown as typeof fetch;

    const reply = await getGrokReply('guild-1', 'user-1', 'hello');

    expect(reply).toBe('Hi there!');
    expect(appendGrokHistory).toHaveBeenCalledWith('guild-1', 'user-1', 'hello', 'Hi there!');
    const span = findSpan();
    expect(span).toBeDefined();
    expect(span!.attributes[RainbotAttr.grokModel]).toBe('grok-test-model');
    expect(span!.attributes[RainbotAttr.guildId]).toBe('guild-1');
    expect(span!.status.code).toBe(SpanStatusCode.UNSET);
  });

  it('resolves a friendly message and marks the span ERROR when the HTTP call fails (getGrokReply never throws)', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'internal error',
    }) as unknown as typeof fetch;

    const reply = await getGrokReply('guild-1', 'user-1', 'hello');

    // This is the resolve-with-a-failure-value trap: the function resolves
    // normally with a friendly string, it never throws, so withSpan's own
    // exception-based error detection alone would never mark this span
    // ERROR — the ERROR status has to come from the explicit
    // trace.getActiveSpan() check inside the withSpan callback.
    expect(reply).toBe('I had trouble thinking of a reply. Try again in a moment.');
    expect(appendGrokHistory).not.toHaveBeenCalled();
    const span = findSpan();
    expect(span).toBeDefined();
    expect(span!.status.code).toBe(SpanStatusCode.ERROR);
  });

  it('resolves a friendly message and marks the span ERROR when xAI returns no message content', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [] }),
    }) as unknown as typeof fetch;

    const reply = await getGrokReply('guild-1', 'user-1', 'hello');

    expect(reply).toBe("I didn't get a clear reply. Want to try again?");
    expect(appendGrokHistory).not.toHaveBeenCalled();
    const span = findSpan();
    expect(span).toBeDefined();
    expect(span!.status.code).toBe(SpanStatusCode.ERROR);
  });

  it('marks the span ERROR and rethrows through to the outer catch when fetch itself throws', async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(new Error('network down')) as unknown as typeof fetch;

    const reply = await getGrokReply('guild-1', 'user-1', 'hello');

    expect(reply).toBe("I couldn't reach Grok right now. Try again in a moment.");
    const span = findSpan();
    expect(span).toBeDefined();
    expect(span!.status.code).toBe(SpanStatusCode.ERROR);
  });

  it('records token-count attributes from the response usage field', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { role: 'assistant', content: 'Hi there!' } }],
        usage: { prompt_tokens: 42, completion_tokens: 8, total_tokens: 50 },
      }),
    }) as unknown as typeof fetch;

    const reply = await getGrokReply('guild-1', 'user-1', 'hello');

    expect(reply).toBe('Hi there!');
    const span = findSpan();
    expect(span).toBeDefined();
    expect(span!.attributes[RainbotAttr.grokPromptTokens]).toBe(42);
    expect(span!.attributes[RainbotAttr.grokCompletionTokens]).toBe(8);
    expect(span!.attributes[RainbotAttr.grokTotalTokens]).toBe(50);
  });

  it('omits token-count attributes when the response has no usage field', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { role: 'assistant', content: 'Hi there!' } }] }),
    }) as unknown as typeof fetch;

    await getGrokReply('guild-1', 'user-1', 'hello');

    const span = findSpan();
    expect(span).toBeDefined();
    expect(span!.attributes[RainbotAttr.grokPromptTokens]).toBeUndefined();
    expect(span!.attributes[RainbotAttr.grokCompletionTokens]).toBeUndefined();
    expect(span!.attributes[RainbotAttr.grokTotalTokens]).toBeUndefined();
  });
});
