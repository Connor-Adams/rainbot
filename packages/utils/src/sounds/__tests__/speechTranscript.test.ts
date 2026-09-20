import { Readable } from 'stream';
import { trimHallucinations } from '../speechTranscript';

// The SDK's own multipart gate. Asserting against it rather than against a
// hand-rolled guess is the point: the bug this covers was a value that looked
// file-ish but that `isUploadable()` rejects, so the request threw before any
// network call and the transcript came back null.

const uploads = require('openai/uploads');

describe('trimHallucinations', () => {
  it('keeps confident speech', () => {
    const text = trimHallucinations([
      { text: ' you are gay', no_speech_prob: 0.01, avg_logprob: -0.2 },
    ]);
    expect(text).toBe('you are gay');
  });

  it('drops segments Whisper itself flags as probably silence', () => {
    const text = trimHallucinations([
      { text: 'real words', no_speech_prob: 0.1, avg_logprob: -0.3 },
      { text: 'Thank you.', no_speech_prob: 0.92, avg_logprob: -0.4 },
    ]);
    expect(text).toBe('real words');
  });

  it('drops segments with very low average confidence', () => {
    const text = trimHallucinations([{ text: 'mumble', no_speech_prob: 0.1, avg_logprob: -2.5 }]);
    expect(text).toBe('');
  });

  it('drops known hallucination boilerplate even when confidently scored', () => {
    const text = trimHallucinations([
      { text: 'Subtitles by the Amara.org community', no_speech_prob: 0.01, avg_logprob: -0.1 },
    ]);
    expect(text).toBe('');
  });

  it('matches hallucination boilerplate case-insensitively', () => {
    const text = trimHallucinations([
      { text: 'thanks for watching!', no_speech_prob: 0.01, avg_logprob: -0.1 },
    ]);
    expect(text).toBe('');
  });

  it('joins surviving segments with single spaces', () => {
    const text = trimHallucinations([
      { text: ' hello ', no_speech_prob: 0.01, avg_logprob: -0.2 },
      { text: ' world ', no_speech_prob: 0.01, avg_logprob: -0.2 },
    ]);
    expect(text).toBe('hello world');
  });

  it('treats missing confidence fields as acceptable', () => {
    expect(trimHallucinations([{ text: 'bruh' }])).toBe('bruh');
  });

  it('returns an empty string for no segments', () => {
    expect(trimHallucinations([])).toBe('');
  });
});

describe('transcribeSpeech', () => {
  afterEach(() => jest.resetModules());

  it('returns null when no API key is configured', async () => {
    jest.resetModules();
    jest.doMock('../../config', () => ({ loadConfig: () => ({ openaiApiKey: undefined }) }));
    const { transcribeSpeech } = require('../speechTranscript');
    await expect(transcribeSpeech(Buffer.from('x'), 'a.ogg')).resolves.toBeNull();
  });

  /**
   * Mocks only the client, not the upload helper: `toFile` stays the real one
   * so the value handed to `create()` is exactly what production builds, and
   * the fake `create()` runs the SDK's real multipart encoder over the body
   * before answering. No network call is made.
   */
  function mockOpenAI(received: Record<string, unknown>, response: unknown): void {
    const mockRealOpenAI = jest.requireActual('openai');
    jest.doMock('openai', () => ({
      toFile: mockRealOpenAI.toFile,
      OpenAI: class {
        audio = {
          transcriptions: {
            create: async (body: Record<string, unknown>) => {
              Object.assign(received, body);
              // Throws exactly as a real request would if `file` is not
              // uploadable - this is the assertion that the old
              // `Readable`-with-a-`.path` value could never have passed.
              await uploads.createForm(body);
              return response;
            },
          },
        };
      },
    }));
  }

  it('uploads a value the SDK accepts as a file, not a bare Readable', async () => {
    jest.resetModules();
    jest.doMock('../../config', () => ({ loadConfig: () => ({ openaiApiKey: 'sk-test' }) }));
    const received: Record<string, unknown> = {};
    mockOpenAI(received, {
      segments: [{ text: 'you are gay', no_speech_prob: 0.01, avg_logprob: -0.2 }],
    });

    const { transcribeSpeech } = require('../speechTranscript');
    await expect(transcribeSpeech(Buffer.from('audio bytes'), 'clip.ogg')).resolves.toBe(
      'you are gay'
    );

    expect(received['file']).toBeDefined();
    expect(uploads.isUploadable(received['file'])).toBe(true);
    expect(received['file']).not.toBeInstanceOf(Readable);
    expect(received['model']).toBe('whisper-1');
    expect(received['response_format']).toBe('verbose_json');
  });

  it('keeps the clip filename on the uploaded file', async () => {
    jest.resetModules();
    jest.doMock('../../config', () => ({ loadConfig: () => ({ openaiApiKey: 'sk-test' }) }));
    const received: Record<string, unknown> = {};
    mockOpenAI(received, { text: 'hello' });

    const { transcribeSpeech } = require('../speechTranscript');
    await expect(transcribeSpeech(Buffer.from('audio bytes'), 'clip.ogg')).resolves.toBe('hello');
    expect((received['file'] as { name?: string }).name).toBe('clip.ogg');
  });

  it('returns null when the SDK rejects the request', async () => {
    jest.resetModules();
    jest.doMock('../../config', () => ({ loadConfig: () => ({ openaiApiKey: 'sk-test' }) }));
    jest.doMock('openai', () => ({
      toFile: jest.requireActual('openai').toFile,
      OpenAI: class {
        audio = {
          transcriptions: {
            create: async () => {
              throw new Error('rate limited');
            },
          },
        };
      },
    }));

    const { transcribeSpeech } = require('../speechTranscript');
    await expect(transcribeSpeech(Buffer.from('audio bytes'), 'clip.ogg')).resolves.toBeNull();
  });
});
