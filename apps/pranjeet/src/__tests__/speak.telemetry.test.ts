import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { trace, SpanStatusCode } from '@opentelemetry/api';
import { RainbotAttr } from '@rainbot/observability/node';

jest.mock('@discordjs/voice', () => ({
  ...jest.requireActual('@discordjs/voice'),
  createAudioResource: jest.fn(() => ({ volume: { setVolume: jest.fn() } })),
}));

jest.mock('../audio/utils', () => ({
  chunkPcmIntoFrames: jest.fn(() => [Buffer.from([1, 2, 3, 4])]),
  framesToReadable: jest.fn(() => ({ fakeStream: true })),
  monoToStereoPcm: jest.fn((buf: Buffer) => buf),
  waitForPlaybackEnd: jest.fn(() => Promise.resolve()),
}));

jest.mock('../tts', () => ({
  generateTTS: jest.fn(),
  normalizeSpeakKey: jest.fn((text: string, voice?: string) => `${voice ?? ''}::${text}`),
}));

const fakeState = {
  connection: {},
  speakQueue: Promise.resolve() as Promise<unknown>,
  lastSpeakKey: '',
  lastSpeakAt: 0,
  player: { play: jest.fn() },
  volume: 1,
  currentResource: null as unknown,
};

jest.mock('../state/guild-state', () => ({
  getOrCreateGuildState: jest.fn(() => fakeState),
}));

import { generateTTS } from '../tts';
import { speakInGuild } from '../speak';

const exporter = new InMemorySpanExporter();

beforeAll(() => {
  trace.setGlobalTracerProvider(
    new BasicTracerProvider({ spanProcessors: [new SimpleSpanProcessor(exporter)] })
  );
});

beforeEach(() => {
  exporter.reset();
  jest.clearAllMocks();
  fakeState.lastSpeakKey = '';
  fakeState.lastSpeakAt = 0;
  fakeState.speakQueue = Promise.resolve();
});

function findSpan() {
  return exporter.getFinishedSpans().find((s) => s.name === 'tts.speak');
}

describe('speakInGuild tts.speak span', () => {
  it('spans generateTTS with provider/voice/text_length attributes on success', async () => {
    (generateTTS as jest.Mock).mockResolvedValue(Buffer.from([0, 0]));

    const result = await speakInGuild('guild-1', 'hello there', 'nova');
    expect(result).toEqual({ status: 'success', message: 'TTS queued' });

    // The synthesis itself runs in the guild's fire-and-forget speak queue,
    // not on speakInGuild's own returned promise — wait for it to settle.
    await fakeState.speakQueue;

    expect(generateTTS).toHaveBeenCalledWith('hello there', 'nova');
    const span = findSpan();
    expect(span).toBeDefined();
    expect(span!.attributes[RainbotAttr.ttsVoice]).toBe('nova');
    expect(span!.attributes[RainbotAttr.textLength]).toBe('hello there'.length);
    expect(typeof span!.attributes[RainbotAttr.ttsProvider]).toBe('string');
    expect(span!.status.code).toBe(SpanStatusCode.UNSET);
  });

  it('marks the span ERROR when generateTTS throws, without changing what speakInGuild itself returns', async () => {
    const boom = new Error('tts provider down');
    (generateTTS as jest.Mock).mockRejectedValue(boom);

    const result = await speakInGuild('guild-1', 'hi', 'nova');
    expect(result).toEqual({ status: 'success', message: 'TTS queued' });

    await fakeState.speakQueue.catch(() => undefined);

    const span = findSpan();
    expect(span).toBeDefined();
    expect(span!.status.code).toBe(SpanStatusCode.ERROR);
  });
});
