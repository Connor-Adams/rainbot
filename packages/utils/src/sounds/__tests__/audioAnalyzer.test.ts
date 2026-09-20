import { parseDescription } from '../audioAnalyzer';

describe('parseDescription', () => {
  it('parses a well-formed reply', () => {
    const parsed = parseDescription(
      JSON.stringify({
        kind: 'sound',
        caption: 'a loud brassy air horn blast',
        tags: ['air horn', 'blast'],
      })
    );
    expect(parsed).toEqual({
      kind: 'sound',
      caption: 'a loud brassy air horn blast',
      tags: ['air horn', 'blast'],
    });
  });

  it('unwraps a fenced code block', () => {
    const parsed = parseDescription(
      '```json\n{"kind":"speech","caption":"a man yells","tags":[]}\n```'
    );
    expect(parsed?.kind).toBe('speech');
  });

  it('rejects an unknown kind', () => {
    expect(parseDescription(JSON.stringify({ kind: 'music', caption: 'x', tags: [] }))).toBeNull();
  });

  it('returns null for unparseable text', () => {
    expect(parseDescription('I could not process that audio.')).toBeNull();
  });

  it('coerces a missing tags field to an empty array', () => {
    expect(parseDescription(JSON.stringify({ kind: 'sound', caption: 'a thud' }))?.tags).toEqual(
      []
    );
  });

  it('drops non-string tags and trims the rest', () => {
    const parsed = parseDescription(
      JSON.stringify({ kind: 'sound', caption: 'a thud', tags: ['  bass  ', 42, null] })
    );
    expect(parsed?.tags).toEqual(['bass']);
  });

  /**
   * The replacement caption model does not reliably reply with bare JSON the
   * way `gpt-4o-audio-preview` did, and requiring the whole string to parse
   * rejected every clip in the library. These cover the shapes production
   * actually produced.
   */
  describe('replies with prose around the JSON', () => {
    const body = '{"kind":"sound","caption":"a bonk","tags":["bonk"]}';

    it('finds the object after a lead-in sentence', () => {
      expect(parseDescription(`Here is the JSON you asked for:\n${body}`)).toEqual({
        kind: 'sound',
        caption: 'a bonk',
        tags: ['bonk'],
      });
    });

    it('finds the object before trailing commentary', () => {
      expect(parseDescription(`${body}\n\nLet me know if you need anything else!`)?.caption).toBe(
        'a bonk'
      );
    });

    it('finds the object with prose on both sides', () => {
      expect(
        parseDescription(`Sure thing. ${body} That clip is a short percussive hit.`)?.caption
      ).toBe('a bonk');
    });

    it('unwraps a fenced block with a language tag and surrounding prose', () => {
      expect(
        parseDescription(`I listened to the clip.\n\`\`\`json\n${body}\n\`\`\`\nHope that helps.`)
          ?.caption
      ).toBe('a bonk');
    });

    it('skips a brace in the prose and keeps looking', () => {
      // A naive scan anchored on the first `{` would stop at `{like this}`.
      expect(parseDescription(`Formatted {like this}, here you go: ${body}`)?.caption).toBe(
        'a bonk'
      );
    });
  });

  it('keeps a caption containing a closing brace intact', () => {
    // A naive "first { to last }" span, or a lazy regex, either truncates
    // this caption or fails to parse it outright.
    const parsed = parseDescription(
      JSON.stringify({
        kind: 'speech',
        caption: 'a man reads out "}" as a curly bracket',
        tags: ['bracket'],
      })
    );
    expect(parsed?.caption).toBe('a man reads out "}" as a curly bracket');
  });

  it('keeps a caption whose braces would unbalance a naive scan', () => {
    const parsed = parseDescription(
      `Here you go: ${JSON.stringify({
        kind: 'sound',
        caption: 'someone shouts }}} repeatedly',
        tags: ['shout'],
      })} done.`
    );
    expect(parsed?.caption).toBe('someone shouts }}} repeatedly');
  });

  it('returns null for a reply that is not JSON at all', () => {
    expect(parseDescription('I am sorry, I cannot help with that request.')).toBeNull();
    expect(parseDescription('')).toBeNull();
    expect(parseDescription('{ this is not json }')).toBeNull();
    // A balanced object that is valid JSON but not a description.
    expect(parseDescription('Nothing useful here: {"error":"refused"}')).toBeNull();
  });

  it('caps runaway tag lists at eight', () => {
    const tags = Array.from({ length: 20 }, (_, i) => `tag${i}`);
    expect(
      parseDescription(JSON.stringify({ kind: 'sound', caption: 'x', tags }))?.tags
    ).toHaveLength(8);
  });
});

describe('describeAudio', () => {
  afterEach(() => jest.resetModules());

  it('returns null when no API key is configured', async () => {
    jest.resetModules();
    jest.doMock('../../config', () => ({
      loadConfig: () => ({ openaiApiKey: undefined, soundCaptionModel: 'test-model' }),
    }));

    const { describeAudio } = require('../audioAnalyzer');
    await expect(describeAudio(Buffer.from('x'), 'a.ogg')).resolves.toBeNull();
  });

  /**
   * Loads describeAudio with the config, the ffmpeg decode and the SDK all
   * stubbed, so nothing spawns a process or reaches the network.
   */
  function loadWithStubs(
    wav: Buffer,
    reply = '{"kind":"sound","caption":"a thud","tags":["thud"]}'
  ) {
    const toWav = jest.fn(async () => wav);
    const create = jest.fn(async () => ({ choices: [{ message: { content: reply } }] }));
    const warn = jest.fn();

    jest.resetModules();
    jest.doMock('../../config', () => ({
      loadConfig: () => ({ openaiApiKey: 'sk-test', soundCaptionModel: 'test-model' }),
    }));
    jest.doMock('../../logger', () => ({
      createLogger: () => ({ info: jest.fn(), warn, error: jest.fn(), debug: jest.fn() }),
    }));
    // Only the decode is replaced. `wasDecodeTruncated` and the constants must
    // stay real, or the truncation check silently becomes a call on undefined.
    jest.doMock('../audioTranscode', () => ({
      ...jest.requireActual('../audioTranscode'),
      toWavBuffer: toWav,
    }));
    jest.doMock('openai', () => ({
      OpenAI: class {
        chat = { completions: { create } };
      },
    }));

    const { describeAudio, MAX_ANALYZABLE_BYTES } = require('../audioAnalyzer');
    const { MAX_DECODE_SECONDS, DECODED_BYTES_PER_SECOND } = require('../audioTranscode');
    return {
      describeAudio,
      MAX_ANALYZABLE_BYTES,
      MAX_DECODE_SECONDS,
      DECODED_BYTES_PER_SECOND,
      toWav,
      create,
      warn,
    };
  }

  it('describes a clip that is within the size limit', async () => {
    const { describeAudio, toWav, create } = loadWithStubs(Buffer.alloc(64 * 1024));

    await expect(describeAudio(Buffer.alloc(16 * 1024), 'thud.ogg')).resolves.toEqual({
      kind: 'sound',
      caption: 'a thud',
      tags: ['thud'],
    });
    expect(toWav).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('asks the API to constrain the reply to a JSON object', async () => {
    const { describeAudio, create } = loadWithStubs(Buffer.alloc(64 * 1024));

    await expect(describeAudio(Buffer.alloc(16 * 1024), 'thud.ogg')).resolves.not.toBeNull();
    expect(create.mock.calls[0][0]).toMatchObject({ response_format: { type: 'json_object' } });
  });

  it('logs an excerpt of a reply it could not parse', async () => {
    const { describeAudio, warn } = loadWithStubs(
      Buffer.alloc(1024),
      'I am sorry, I cannot identify that audio.'
    );

    await expect(describeAudio(Buffer.alloc(16 * 1024), 'bonk.ogg')).resolves.toBeNull();
    const logged = warn.mock.calls.map(([line]) => String(line)).join('\n');
    expect(logged).toContain('bonk.ogg');
    // The reply itself is what made this undiagnosable from the log alone.
    expect(logged).toContain('I am sorry, I cannot identify that audio.');
  });

  it('bounds and flattens the excerpt so a long refusal cannot flood the log', async () => {
    const reply = `no.\n${'x'.repeat(5000)}`;
    const { describeAudio, warn } = loadWithStubs(Buffer.alloc(1024), reply);

    await expect(describeAudio(Buffer.alloc(16 * 1024), 'bonk.ogg')).resolves.toBeNull();
    // One line per failed clip, as before - not one line plus a dump.
    expect(warn).toHaveBeenCalledTimes(1);
    const line = String(warn.mock.calls[0][0]);
    expect(line).not.toContain('\n');
    expect(line.length).toBeLessThan(500);
    expect(line).toContain('...');
  });

  it('skips an oversized source without even decoding it', async () => {
    const { describeAudio, MAX_ANALYZABLE_BYTES, toWav, create } = loadWithStubs(Buffer.alloc(16));
    const oversized = Buffer.alloc(MAX_ANALYZABLE_BYTES + 1);

    await expect(describeAudio(oversized, 'huge.mp3')).resolves.toBeNull();
    // No ffmpeg spawn and no inline base64 payload: the guard has to land
    // before the decode, or the memory is already spent.
    expect(toWav).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it('skips a small file that decodes to an oversized WAV', async () => {
    const { describeAudio, MAX_ANALYZABLE_BYTES, toWav, create } = loadWithStubs(
      Buffer.alloc(9 * 1024 * 1024)
    );
    expect(9 * 1024 * 1024).toBeGreaterThan(MAX_ANALYZABLE_BYTES);

    await expect(describeAudio(Buffer.alloc(256 * 1024), 'dense.mp3')).resolves.toBeNull();
    expect(toWav).toHaveBeenCalledTimes(1);
    expect(create).not.toHaveBeenCalled();
  });

  describe('the 30s decode cap', () => {
    /** A decode that came back at the cap, as a truncated one always does. */
    function cappedWav(seconds: number, bytesPerSecond: number) {
      // Plus a header, the way ffmpeg's own output carries one.
      return Buffer.alloc(seconds * bytesPerSecond + 78);
    }

    it('warns when the caption describes only the first 30s of a longer clip', async () => {
      const probe = loadWithStubs(Buffer.alloc(0));
      const { describeAudio, warn, create } = loadWithStubs(
        cappedWav(probe.MAX_DECODE_SECONDS, probe.DECODED_BYTES_PER_SECOND)
      );

      // Still analysed - a partial caption beats no caption. It just must not
      // be partial in silence: the row is written with the full source size,
      // so the sweep's source_size skip never revisits it.
      await expect(describeAudio(Buffer.alloc(4 * 1024 * 1024), 'podcast.ogg')).resolves.toEqual({
        kind: 'sound',
        caption: 'a thud',
        tags: ['thud'],
      });
      expect(create).toHaveBeenCalledTimes(1);

      const warning = warn.mock.calls.map(([line]) => String(line)).join('\n');
      expect(warning).toContain('podcast.ogg');
      expect(warning).toContain(`${probe.MAX_DECODE_SECONDS}s`);
      // The asymmetry with the transcript is the part a reader needs told.
      expect(warning).toContain('transcript');
    });

    it('says nothing about a clip that decoded in full', async () => {
      const probe = loadWithStubs(Buffer.alloc(0));
      // One sample short of the cap: the same clip a second earlier.
      const { describeAudio, warn } = loadWithStubs(
        Buffer.alloc(probe.MAX_DECODE_SECONDS * probe.DECODED_BYTES_PER_SECOND - 1)
      );

      await expect(describeAudio(Buffer.alloc(16 * 1024), 'thud.ogg')).resolves.not.toBeNull();
      expect(warn).not.toHaveBeenCalled();
    });
  });

  it('accepts a clip exactly at the limit', async () => {
    const { describeAudio, MAX_ANALYZABLE_BYTES, create } = loadWithStubs(Buffer.alloc(1024));

    await expect(
      describeAudio(Buffer.alloc(MAX_ANALYZABLE_BYTES), 'edge.ogg')
    ).resolves.not.toBeNull();
    expect(create).toHaveBeenCalledTimes(1);
  });
});
