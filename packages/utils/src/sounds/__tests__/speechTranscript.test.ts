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

/**
 * Leading bytes of each container, as a real file of that kind carries them.
 *
 * Padded past the longest signature offset so nothing is decided by a short
 * read. `unidentified` is an AIFF-style `FORM` header: a real container, and
 * deliberately not one any signature here matches.
 */
const HEADS = {
  ogg: Buffer.concat([Buffer.from('OggS', 'latin1'), Buffer.alloc(60)]),
  webm: Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(60)]),
  wav: Buffer.concat([
    Buffer.from('RIFF', 'latin1'),
    Buffer.alloc(4),
    Buffer.from('WAVE', 'latin1'),
    Buffer.alloc(60),
  ]),
  flac: Buffer.concat([Buffer.from('fLaC', 'latin1'), Buffer.alloc(60)]),
  m4a: Buffer.concat([Buffer.alloc(4), Buffer.from('ftypM4A ', 'latin1'), Buffer.alloc(60)]),
  mp3: Buffer.concat([Buffer.from('ID3', 'latin1'), Buffer.alloc(60)]),
  mp3Bare: Buffer.concat([Buffer.from([0xff, 0xfb]), Buffer.alloc(60)]),
  unidentified: Buffer.concat([Buffer.from('FORM', 'latin1'), Buffer.alloc(60)]),
};

describe('uploadDescriptorFor', () => {
  it('describes the container the bytes actually are', () => {
    // The name is held constant and wrong on purpose: only the bytes decide.
    expect(uploadDescriptorFor('a.bin', HEADS.ogg)).toEqual({
      uploadName: 'a.ogg',
      contentType: 'audio/ogg',
    });
    expect(uploadDescriptorFor('a.bin', HEADS.webm)).toEqual({
      uploadName: 'a.webm',
      contentType: 'audio/webm',
    });
    expect(uploadDescriptorFor('a.bin', HEADS.wav)).toEqual({
      uploadName: 'a.wav',
      contentType: 'audio/wav',
    });
    expect(uploadDescriptorFor('a.bin', HEADS.flac)).toEqual({
      uploadName: 'a.flac',
      contentType: 'audio/flac',
    });
    expect(uploadDescriptorFor('a.bin', HEADS.m4a)).toEqual({
      uploadName: 'a.m4a',
      contentType: 'audio/mp4',
    });
    expect(uploadDescriptorFor('a.bin', HEADS.mp3)).toEqual({
      uploadName: 'a.mp3',
      contentType: 'audio/mpeg',
    });
    expect(uploadDescriptorFor('a.bin', HEADS.mp3Bare).contentType).toBe('audio/mpeg');
  });

  /**
   * The exact pairing production hands this function.
   *
   * `getSoundBuffer` resolves `laugh.mp3` through `resolveSoundFilename`,
   * which prefers the transcoded `laugh.ogg` copy, while `analyzeSound` still
   * passes the original name. `SOUND_TRANSCODE_DELETE_ORIGINAL` defaults to
   * false, so `listSounds()` returns both names and the `.mp3` entry really is
   * analysed with Ogg bytes. Keying off the name declared MP3 over an Ogg
   * payload for every `.mp3`/`.wav`/`.m4a`/`.flac` clip in the library.
   */
  it('declares Ogg for a .mp3 name whose bytes are the transcoded Ogg copy', () => {
    expect(uploadDescriptorFor('laugh.mp3', HEADS.ogg)).toEqual({
      uploadName: 'laugh.ogg',
      contentType: 'audio/ogg',
    });
    expect(uploadDescriptorFor('clip.wav', HEADS.ogg).contentType).toBe('audio/ogg');
    expect(uploadDescriptorFor('clip.m4a', HEADS.ogg).contentType).toBe('audio/ogg');
    expect(uploadDescriptorFor('clip.flac', HEADS.ogg).contentType).toBe('audio/ogg');
  });

  it('presents an Opus clip as the Ogg container it actually is', () => {
    // `opus` is not on the API's supported-extension list; `ogg` is, and the
    // bytes are an Ogg container either way.
    expect(uploadDescriptorFor('a.opus', HEADS.ogg)).toEqual({
      uploadName: 'a.ogg',
      contentType: 'audio/ogg',
    });
  });

  it('leaves a name alone when it already matches the bytes', () => {
    expect(uploadDescriptorFor('Some Clip (1).mp3', HEADS.mp3).uploadName).toBe(
      'Some Clip (1).mp3'
    );
  });

  it('lowercases an extension that is only a case variant of the container', () => {
    // The API states its supported list in lowercase, and this function's one
    // job is to produce a name whose extension is literally on that list.
    // Uppercase is how a clip enters the library in the first place - both the
    // multer `fileFilter` and `listSounds` match case-insensitively, and
    // `uploadSound`'s catch keeps the original name when the transcode fails.
    expect(uploadDescriptorFor('CLIP.MP3', HEADS.mp3).uploadName).toBe('CLIP.mp3');
    expect(uploadDescriptorFor('CLIP.Ogg', HEADS.ogg).uploadName).toBe('CLIP.ogg');
    // Only the extension is touched; the stem keeps its case.
    expect(uploadDescriptorFor('Some Clip (1).WAV', HEADS.wav).uploadName).toBe(
      'Some Clip (1).wav'
    );
  });

  describe('bytes no signature matches', () => {
    it('falls back to the name, which is the only evidence left', () => {
      expect(uploadDescriptorFor('a.mp3', HEADS.unidentified).contentType).toBe('audio/mpeg');
      expect(uploadDescriptorFor('a.wav', HEADS.unidentified).contentType).toBe('audio/wav');
      expect(uploadDescriptorFor('a.webm', HEADS.unidentified).contentType).toBe('audio/webm');
      expect(uploadDescriptorFor('a.m4a', HEADS.unidentified).contentType).toBe('audio/mp4');
      expect(uploadDescriptorFor('a.flac', HEADS.unidentified).contentType).toBe('audio/flac');
      expect(uploadDescriptorFor('a.ogg', HEADS.unidentified).contentType).toBe('audio/ogg');
    });

    it('falls back to a type the API will accept, not to octet-stream', () => {
      expect(uploadDescriptorFor('a.aiff', HEADS.unidentified).contentType).toBe('audio/ogg');
      expect(uploadDescriptorFor('a', HEADS.unidentified).contentType).toBe('audio/ogg');
    });

    it('renames an extension the API will not accept, not just the .opus case', () => {
      // The API gates on the filename extension too, so declaring `audio/ogg`
      // while leaving the name `a.aiff` sends a name it refuses on sight
      // paired with a type that contradicts it. Either the rename matters here
      // as it does for `.opus`, or it never mattered at all.
      expect(uploadDescriptorFor('a.aiff', HEADS.unidentified)).toEqual({
        uploadName: 'a.ogg',
        contentType: 'audio/ogg',
      });
      expect(uploadDescriptorFor('a', HEADS.unidentified)).toEqual({
        uploadName: 'a.ogg',
        contentType: 'audio/ogg',
      });
    });

    it('survives a buffer too short to hold any signature', () => {
      expect(uploadDescriptorFor('a.mp3', Buffer.alloc(0)).contentType).toBe('audio/mpeg');
      expect(uploadDescriptorFor('a.mp3', Buffer.from('O')).contentType).toBe('audio/mpeg');
    });
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
   * The content type that actually reaches the API, for each pairing of name
   * and bytes this library produces.
   *
   * Asserted on the `File` the fake client receives rather than on the helper
   * alone, so a future refactor that computes the right type and then forgets
   * to hand it to `toFile` fails here. Every case supplies bytes as well as a
   * name, because the two disagree in production and the bytes are what the
   * server opens. No network call is made.
   */
  describe('the content type on the uploaded file', () => {
    const cases: Array<{
      filename: string;
      bytes: Buffer;
      contentType: string;
      uploadName: string;
    }> = [
      { filename: 'clip.ogg', bytes: HEADS.ogg, contentType: 'audio/ogg', uploadName: 'clip.ogg' },
      // Opus-in-Ogg: `opus` is absent from the API's supported-extension list
      // while `ogg` is on it, and the container really is Ogg.
      { filename: 'clip.opus', bytes: HEADS.ogg, contentType: 'audio/ogg', uploadName: 'clip.ogg' },
      {
        filename: 'clip.webm',
        bytes: HEADS.webm,
        contentType: 'audio/webm',
        uploadName: 'clip.webm',
      },
      { filename: 'clip.mp3', bytes: HEADS.mp3, contentType: 'audio/mpeg', uploadName: 'clip.mp3' },
      { filename: 'clip.wav', bytes: HEADS.wav, contentType: 'audio/wav', uploadName: 'clip.wav' },
      { filename: 'clip.m4a', bytes: HEADS.m4a, contentType: 'audio/mp4', uploadName: 'clip.m4a' },
      {
        filename: 'clip.flac',
        bytes: HEADS.flac,
        contentType: 'audio/flac',
        uploadName: 'clip.flac',
      },
      // The transcoded copy behind an original name - what `getSoundBuffer`
      // hands back for most of the pre-transcode library. The bytes win.
      {
        filename: 'laugh.mp3',
        bytes: HEADS.ogg,
        contentType: 'audio/ogg',
        uploadName: 'laugh.ogg',
      },
      {
        filename: 'laugh.wav',
        bytes: HEADS.ogg,
        contentType: 'audio/ogg',
        uploadName: 'laugh.ogg',
      },
      {
        filename: 'laugh.flac',
        bytes: HEADS.ogg,
        contentType: 'audio/ogg',
        uploadName: 'laugh.ogg',
      },
      // Unidentifiable bytes fall back to the name, which must still declare
      // something the API accepts - never an empty type, never octet-stream -
      // and carry a name it accepts too, since it gates on both.
      {
        filename: 'clip.aiff',
        bytes: HEADS.unidentified,
        contentType: 'audio/ogg',
        uploadName: 'clip.ogg',
      },
      {
        filename: 'clip',
        bytes: HEADS.unidentified,
        contentType: 'audio/ogg',
        uploadName: 'clip.ogg',
      },
      {
        filename: 'clip.mp3',
        bytes: HEADS.unidentified,
        contentType: 'audio/mpeg',
        uploadName: 'clip.mp3',
      },
      // Case is not part of finding the container, but the extension that goes
      // out is always the lowercase form the API's supported list names.
      { filename: 'CLIP.OPUS', bytes: HEADS.ogg, contentType: 'audio/ogg', uploadName: 'CLIP.ogg' },
      { filename: 'CLIP.MP3', bytes: HEADS.mp3, contentType: 'audio/mpeg', uploadName: 'CLIP.mp3' },
    ];

    it.each(cases)(
      'sends $filename as $contentType',
      async ({ filename, bytes, contentType, uploadName }) => {
        jest.resetModules();
        jest.doMock('../../config', () => ({ loadConfig: () => ({ openaiApiKey: 'sk-test' }) }));
        const received: Record<string, unknown> = {};
        mockOpenAI(received, { text: 'hello' });

        const { transcribeSpeech } = require('../speechTranscript');
        await expect(transcribeSpeech(bytes, filename)).resolves.toEqual({
          ok: true,
          transcript: 'hello',
        });

        const file = received['file'] as { type?: string; name?: string };
        expect(file.type).toBe(contentType);
        expect(file.name).toBe(uploadName);
      }
    );

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
