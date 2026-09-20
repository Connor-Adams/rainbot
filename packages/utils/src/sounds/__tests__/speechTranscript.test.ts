import { Readable } from 'stream';
import { trimHallucinations, uploadDescriptorFor } from '../speechTranscript';

// The SDK's own multipart gate. Asserting against it rather than against a
// hand-rolled guess is the point: the bug this covers was a value that looked
// file-ish but that `isUploadable()` rejects, so the request threw before any
// network call and the transcript came back null.
//
// `isUploadable()` is necessary and not sufficient, though, which is the
// second bug these tests now cover: it says the request can be *built*, not
// that the server will accept it. A `toFile` call with no `type` builds
// perfectly and is rejected with `400 Invalid file format` by every request,
// so the assertions below check the content type that actually lands on the
// upload, not merely that the value is file-shaped.

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

describe('uploadDescriptorFor', () => {
  it('maps every extension this library contains to a type the API accepts', () => {
    expect(uploadDescriptorFor('a.ogg').contentType).toBe('audio/ogg');
    expect(uploadDescriptorFor('a.oga').contentType).toBe('audio/ogg');
    expect(uploadDescriptorFor('a.webm').contentType).toBe('audio/webm');
    expect(uploadDescriptorFor('a.mp3').contentType).toBe('audio/mpeg');
    expect(uploadDescriptorFor('a.wav').contentType).toBe('audio/wav');
    expect(uploadDescriptorFor('a.m4a').contentType).toBe('audio/mp4');
    expect(uploadDescriptorFor('a.flac').contentType).toBe('audio/flac');
  });

  it('presents an Opus clip as the Ogg container it actually is', () => {
    // `opus` is not on the API's supported-extension list; `ogg` is, and the
    // bytes are an Ogg container either way.
    expect(uploadDescriptorFor('a.opus')).toEqual({
      uploadName: 'a.ogg',
      contentType: 'audio/ogg',
    });
  });

  it('falls back to a type the API will accept, not to octet-stream', () => {
    expect(uploadDescriptorFor('a.aiff').contentType).toBe('audio/ogg');
    expect(uploadDescriptorFor('a').contentType).toBe('audio/ogg');
  });

  it('leaves every non-opus filename alone', () => {
    expect(uploadDescriptorFor('Some Clip (1).mp3').uploadName).toBe('Some Clip (1).mp3');
  });
});

describe('transcribeSpeech', () => {
  afterEach(() => jest.resetModules());

  it('reports failure when no API key is configured', async () => {
    jest.resetModules();
    jest.doMock('../../config', () => ({ loadConfig: () => ({ openaiApiKey: undefined }) }));
    const { transcribeSpeech } = require('../speechTranscript');
    await expect(transcribeSpeech(Buffer.from('x'), 'a.ogg')).resolves.toEqual({ ok: false });
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
    await expect(transcribeSpeech(Buffer.from('audio bytes'), 'clip.ogg')).resolves.toEqual({
      ok: true,
      transcript: 'you are gay',
    });

    expect(received['file']).toBeDefined();
    expect(uploads.isUploadable(received['file'])).toBe(true);
    expect(received['file']).not.toBeInstanceOf(Readable);
    // Being uploadable is not enough on its own - an untyped File is
    // uploadable and is still rejected by the server - so pin the content
    // type here too.
    expect((received['file'] as { type?: string }).type).toBe('audio/ogg');
    expect(received['model']).toBe('whisper-1');
    expect(received['response_format']).toBe('verbose_json');
  });

  /**
   * The content type that actually reaches the API, per extension this
   * library contains.
   *
   * Asserted on the `File` the fake client receives rather than on the helper
   * alone, so a future refactor that computes the right type and then forgets
   * to hand it to `toFile` fails here. No network call is made.
   */
  describe('the content type on the uploaded file', () => {
    const cases: Array<[string, string, string]> = [
      // filename, expected content type, expected upload filename
      ['clip.ogg', 'audio/ogg', 'clip.ogg'],
      ['clip.oga', 'audio/ogg', 'clip.oga'],
      // Opus-in-Ogg: `opus` is absent from the API's supported-extension list
      // while `ogg` is on it, and the container really is Ogg.
      ['clip.opus', 'audio/ogg', 'clip.ogg'],
      ['clip.webm', 'audio/webm', 'clip.webm'],
      ['clip.mp3', 'audio/mpeg', 'clip.mp3'],
      ['clip.wav', 'audio/wav', 'clip.wav'],
      ['clip.m4a', 'audio/mp4', 'clip.m4a'],
      ['clip.flac', 'audio/flac', 'clip.flac'],
      // Unknown and absent extensions must still declare something the API
      // will accept - never an empty type, and never octet-stream.
      ['clip.aiff', 'audio/ogg', 'clip.aiff'],
      ['clip', 'audio/ogg', 'clip'],
      // Case is not part of the answer.
      ['CLIP.OPUS', 'audio/ogg', 'CLIP.ogg'],
      ['CLIP.MP3', 'audio/mpeg', 'CLIP.MP3'],
    ];

    it.each(cases)('sends %s as %s', async (filename, contentType, uploadName) => {
      jest.resetModules();
      jest.doMock('../../config', () => ({ loadConfig: () => ({ openaiApiKey: 'sk-test' }) }));
      const received: Record<string, unknown> = {};
      mockOpenAI(received, { text: 'hello' });

      const { transcribeSpeech } = require('../speechTranscript');
      await expect(transcribeSpeech(Buffer.from('audio bytes'), filename)).resolves.toEqual({
        ok: true,
        transcript: 'hello',
      });

      const file = received['file'] as { type?: string; name?: string };
      expect(file.type).toBe(contentType);
      expect(file.name).toBe(uploadName);
    });

    it('never leaves the content type empty', async () => {
      jest.resetModules();
      jest.doMock('../../config', () => ({ loadConfig: () => ({ openaiApiKey: 'sk-test' }) }));
      const received: Record<string, unknown> = {};
      mockOpenAI(received, { text: 'hello' });

      const { transcribeSpeech } = require('../speechTranscript');
      await transcribeSpeech(Buffer.from('audio bytes'), 'weird.name.with.dots');
      expect((received['file'] as { type?: string }).type).not.toBe('');
    });
  });

  it('keeps the clip filename on the uploaded file', async () => {
    jest.resetModules();
    jest.doMock('../../config', () => ({ loadConfig: () => ({ openaiApiKey: 'sk-test' }) }));
    const received: Record<string, unknown> = {};
    mockOpenAI(received, { text: 'hello' });

    const { transcribeSpeech } = require('../speechTranscript');
    await expect(transcribeSpeech(Buffer.from('audio bytes'), 'clip.ogg')).resolves.toEqual({
      ok: true,
      transcript: 'hello',
    });
    expect((received['file'] as { name?: string }).name).toBe('clip.ogg');
  });

  it('reports a genuinely empty transcript (not a failure) when every segment is trimmed away', async () => {
    jest.resetModules();
    jest.doMock('../../config', () => ({ loadConfig: () => ({ openaiApiKey: 'sk-test' }) }));
    const received: Record<string, unknown> = {};
    // A clip whose only spoken content is hallucination-blacklisted ("you") -
    // Whisper succeeds, but trimHallucinations legitimately reduces it to
    // nothing. This must be distinguishable from a failed request.
    mockOpenAI(received, {
      segments: [{ text: 'you', no_speech_prob: 0.01, avg_logprob: -0.1 }],
    });

    const { transcribeSpeech } = require('../speechTranscript');
    await expect(transcribeSpeech(Buffer.from('audio bytes'), 'clip.ogg')).resolves.toEqual({
      ok: true,
      transcript: null,
    });
  });

  it('reports failure when the SDK rejects the request', async () => {
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
    await expect(transcribeSpeech(Buffer.from('audio bytes'), 'clip.ogg')).resolves.toEqual({
      ok: false,
    });
  });
});
