import { DESCRIBE_PROMPT, looksLikeMissingAudioReply, parseDescription } from '../audioAnalyzer';

/**
 * The prompt is the whole interface to the caption model, and one clause of it
 * cost 21 of 263 clips in a production sweep: asking the model to "describe
 * the speaker" read as a request to identify who was talking, which it
 * refuses on principle - and having refused once it went on to refuse clips of
 * animals too. These pin the intent that replaced it rather than the prose, so
 * the wording stays free to change and the trap does not come back.
 */
describe('DESCRIBE_PROMPT', () => {
  it('never asks the model to identify who is speaking', () => {
    // The exact clause that caused the outage.
    expect(DESCRIBE_PROMPT).not.toMatch(/describe the speaker/i);

    // And, more generally, every naming verb in the prompt sits under a
    // prohibition. A bare "identify the speaker" reintroduced anywhere - in
    // any rewording - fails here rather than in a production sweep.
    const naming = /\b(?:identify|name|who is speaking|whose)\b/gi;
    let match = naming.exec(DESCRIBE_PROMPT);
    let seen = 0;
    while (match) {
      const lead = DESCRIBE_PROMPT.slice(Math.max(0, match.index - 40), match.index);
      expect(`${lead}[${match[0]}]`).toMatch(/\b(?:never|not|no)\b/i);
      seen += 1;
      match = naming.exec(DESCRIBE_PROMPT);
    }
    // Guards the loop itself: a prompt that mentioned none of these would pass
    // vacuously, and the prohibition is supposed to be there.
    expect(seen).toBeGreaterThan(0);
  });

  it('tells the model outright not to identify anyone', () => {
    // Stated, not merely omitted: a model that has been told not to identify
    // anyone does not have to infer it from the absence of the request.
    expect(DESCRIBE_PROMPT).toMatch(/never identify, name, or guess whose voice it is/i);
  });

  it('asks for the voice as a sonic quality instead', () => {
    expect(DESCRIBE_PROMPT).toMatch(/how (?:it|the voice) sounds/i);
    for (const quality of ['tone', 'delivery', 'pitch', 'accent', 'emotion']) {
      expect(DESCRIBE_PROMPT).toContain(quality);
    }
  });

  it('keeps the rule that stopped the model inventing dialogue', () => {
    // A separate, already-fixed class of bug: without this the model supplied
    // plausible words for clips that had none, and they reached the search doc.
    expect(DESCRIBE_PROMPT).toContain('Do not invent words that were not spoken');
  });

  it('keeps the reply contract the parser depends on', () => {
    for (const key of ['kind', 'caption', 'tags']) {
      expect(DESCRIBE_PROMPT).toContain(`"${key}"`);
    }
    for (const kind of ['speech', 'sound', 'mixed']) {
      expect(DESCRIBE_PROMPT).toContain(`"${kind}"`);
    }
    expect(DESCRIBE_PROMPT).toMatch(/JSON only, no prose and no code fence/);
    expect(DESCRIBE_PROMPT).toMatch(/3 to 8 short lowercase keyword phrases/);
  });
});

/**
 * The predicate that decides whether a failed reply is worth one more request.
 * It has to separate three things that all arrive as "prose instead of JSON":
 * the model claiming it got no audio (resend), the model refusing on content
 * grounds (do not resend - the sweep retries it on a later run anyway), and
 * the model simply botching the reply (do not resend).
 */
describe('looksLikeMissingAudioReply', () => {
  // Verbatim from a production sweep. These are the replies the retry exists
  // for, so they are pinned exactly rather than paraphrased.
  const DEFLECTIONS = [
    "I can't listen to the audio. Please upload the clip so I can help you with the description.",
    "Sure, please provide the audio clip you'd like me to listen to. Once I can hear it, I'll describe it.",
    "Sure, please provide the audio clip you'd like me to listen to.",
    "Please provide the audio clip you'd like me to listen to, and I'll generate the JSON.",
    "I'm sorry, but I can't process audio. Could you provide more details about the clip?",
    "I can't actually hear the audio clip. Could you please provide more details about it?",
  ];

  it.each(DEFLECTIONS)('spots %s', (reply) => {
    expect(looksLikeMissingAudioReply(reply)).toBe(true);
  });

  it('spots the curly-apostrophe spelling too', () => {
    // Production emits both, sometimes in the same sweep, and a pattern that
    // knows only the straight one would resend half the clips it should.
    expect(looksLikeMissingAudioReply('I can’t hear the audio clip.')).toBe(true);
    expect(looksLikeMissingAudioReply('I can’t actually listen to the recording.')).toBe(true);
  });

  /**
   * The load-bearing half. A content refusal must fall through untouched: no
   * row is written either way, so the sweep retries the clip on a later run,
   * and resending it would only buy the same refusal at twice the price.
   */
  it.each([
    "I'm sorry, but I can't assist with that request.",
    "I'm sorry, but I can't help with that request.",
    "I can't help with identifying who is speaking from a voice sample, but I can analyze the content of the audio.",
    "I can't identify speakers from voice samples. Please let me know if there's another way I can assist.",
    'I can’t identify speakers from a voice sample. Please let me know if you need anything else.',
  ])('leaves the genuine refusal %s alone', (reply) => {
    expect(looksLikeMissingAudioReply(reply)).toBe(false);
  });

  it('leaves a merely malformed reply alone', () => {
    // Nothing the tolerant parser could salvage, but nothing claiming the
    // audio was missing either - a second identical request buys nothing.
    expect(looksLikeMissingAudioReply('{ this is not json }')).toBe(false);
    expect(looksLikeMissingAudioReply('{"kind":"music","caption":"a clip","tags":[]}')).toBe(false);
    expect(looksLikeMissingAudioReply('')).toBe(false);
    expect(looksLikeMissingAudioReply('Here is the description you asked for.')).toBe(false);
  });

  it('does not mistake a request for more detail for a request for the audio', () => {
    // The determiner set is closed precisely so `more` cannot stand in for an
    // article here. This sentence is the tail of real refusals.
    expect(looksLikeMissingAudioReply('Could you provide more details about the clip?')).toBe(
      false
    );
  });

  it('does not fire on a caption that happens to mention listening', () => {
    // A description is a description even when its words overlap the pattern's
    // vocabulary; this only ever runs on a reply that already failed to parse,
    // but the predicate should not be the reason a good clip gets resent.
    expect(
      looksLikeMissingAudioReply('A calm narrator explains how to access a sound library.')
    ).toBe(false);
  });
});

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

  /**
   * A reply that wraps the description in an outer object. JSON mode makes
   * this shape likelier, not rarer: it guarantees an object without saying
   * which object. The scan only yields depth-zero spans, so the outer span
   * parsed, failed validation, and the inner one was never offered.
   */
  describe('a description wrapped in an outer object', () => {
    it('finds the description one level down', () => {
      expect(
        parseDescription('{"description": {"kind":"sound","caption":"a bonk","tags":["bonk"]}}')
      ).toEqual({ kind: 'sound', caption: 'a bonk', tags: ['bonk'] });
    });

    it('finds it under any property name, and past ones that do not fit', () => {
      expect(
        parseDescription(
          '{"model":"gpt-audio-1.5","usage":{"tokens":9},"result":{"kind":"speech","caption":"a man yells","tags":[]}}'
        )?.caption
      ).toBe('a man yells');
    });

    it('finds it inside a wrapper surrounded by prose', () => {
      expect(
        parseDescription(
          'Here you go:\n{"description":{"kind":"mixed","caption":"a shout over a beat","tags":["shout"]}}\nHope that helps.'
        )?.kind
      ).toBe('mixed');
    });

    it('still returns null when nothing one level down is a description', () => {
      expect(parseDescription('{"error":{"code":"refused","message":"no"}}')).toBeNull();
      expect(parseDescription('{"outer":{"inner":{"kind":"sound","caption":"x"}}}')).toBeNull();
    });
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
  const DEFAULT_REPLY = '{"kind":"sound","caption":"a thud","tags":["thud"]}';

  function loadWithStubs(wav: Buffer, reply = DEFAULT_REPLY) {
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
    // The happy path pays nothing for the fallback: one request, no retry.
    expect(create).toHaveBeenCalledTimes(1);
  });

  /**
   * The SDK's types accept `response_format`; that proves nothing about the
   * endpoint, which is how the plain Readable, the retired model name and the
   * empty content type all shipped. If gpt-audio-1.5 refuses the parameter,
   * `create` throws, the outer catch returns null and every clip in the
   * library fails - the exact outage this pipeline keeps having. So the
   * rejection is survived rather than gambled on.
   */
  describe('an API that refuses the JSON-object constraint outright', () => {
    /** The 400 the SDK surfaces for an unsupported parameter. */
    function unsupportedParameterError() {
      return Object.assign(
        new Error("400 Unsupported parameter: 'response_format' is not supported with this model."),
        { status: 400, error: { param: 'response_format' } }
      );
    }

    it('retries once without the parameter and returns the description', async () => {
      const { describeAudio, create } = loadWithStubs(Buffer.alloc(64 * 1024));
      create.mockRejectedValueOnce(unsupportedParameterError());

      await expect(describeAudio(Buffer.alloc(16 * 1024), 'thud.ogg')).resolves.toEqual({
        kind: 'sound',
        caption: 'a thud',
        tags: ['thud'],
      });

      expect(create).toHaveBeenCalledTimes(2);
      expect(create.mock.calls[0][0]).toHaveProperty('response_format');
      // The retry drops only that one parameter - the audio still has to go.
      const retried = create.mock.calls[1][0];
      expect(retried).not.toHaveProperty('response_format');
      expect(retried.messages).toEqual(create.mock.calls[0][0].messages);
      expect(retried.model).toBe('test-model');
    });

    it('pays the rejected request once per process, not once per clip', async () => {
      const { describeAudio, create, warn } = loadWithStubs(Buffer.alloc(64 * 1024));
      create.mockRejectedValueOnce(unsupportedParameterError());

      await expect(describeAudio(Buffer.alloc(16 * 1024), 'one.ogg')).resolves.not.toBeNull();
      await expect(describeAudio(Buffer.alloc(16 * 1024), 'two.ogg')).resolves.not.toBeNull();
      await expect(describeAudio(Buffer.alloc(16 * 1024), 'three.ogg')).resolves.not.toBeNull();

      // 2 for the first clip, then 1 each - not 2 each.
      expect(create).toHaveBeenCalledTimes(4);
      for (const call of create.mock.calls.slice(1)) {
        expect(call[0]).not.toHaveProperty('response_format');
      }
      // Visible, but not a line per clip.
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0][0])).toContain('test-model');
    });

    /**
     * The sweep runs `Promise.all` over batches of ANALYSIS_CONCURRENCY clips,
     * and the upload path drives the same limiter, so concurrent calls are the
     * normal case. The sequential test above cannot see this: it lets the memo
     * settle between clips.
     *
     * With the memo read inside the catch, all three clips send the parameter,
     * all three 400, the first clears the memo and retries, and the other two
     * read the already-cleared `false`, skip their own retry and rethrow into
     * the outer catch - `ok, null, null`. So this asserts on the outcome every
     * caller actually sees, not on the call count.
     */
    it('retries every clip of a concurrent batch, not just the one that won the race', async () => {
      const { describeAudio, create } = loadWithStubs(Buffer.alloc(64 * 1024));
      // Not `mockRejectedValueOnce`: this endpoint refuses the parameter
      // every time it is sent, which is what a model that does not support it
      // actually does.
      const ok = { choices: [{ message: { content: DEFAULT_REPLY } }] };
      create.mockImplementation(async (request: { response_format?: unknown }) => {
        if (request.response_format) throw unsupportedParameterError();
        return ok;
      });

      const results = await Promise.all([
        describeAudio(Buffer.alloc(16 * 1024), 'one.ogg'),
        describeAudio(Buffer.alloc(16 * 1024), 'two.ogg'),
        describeAudio(Buffer.alloc(16 * 1024), 'three.ogg'),
      ]);

      for (const result of results) {
        expect(result).toEqual({ kind: 'sound', caption: 'a thud', tags: ['thud'] });
      }
      // Six calls: each clip pays its own rejected request plus its retry,
      // because all three were already in flight when the answer was found.
      expect(create).toHaveBeenCalledTimes(6);
    });

    it('does not retry a 400 that is about something else', async () => {
      const { describeAudio, create, warn } = loadWithStubs(Buffer.alloc(64 * 1024));
      create.mockRejectedValueOnce(
        Object.assign(new Error('400 Invalid value for model'), { status: 400 })
      );

      await expect(describeAudio(Buffer.alloc(16 * 1024), 'thud.ogg')).resolves.toBeNull();
      expect(create).toHaveBeenCalledTimes(1);
      // And the memo is untouched: the next clip still asks for JSON mode.
      await expect(describeAudio(Buffer.alloc(16 * 1024), 'next.ogg')).resolves.not.toBeNull();
      expect(create.mock.calls[1][0]).toHaveProperty('response_format');
      expect(warn).toHaveBeenCalledTimes(1);
    });

    it('gives up rather than looping when the retry fails too', async () => {
      const { describeAudio, create } = loadWithStubs(Buffer.alloc(64 * 1024));
      create.mockRejectedValueOnce(unsupportedParameterError());
      create.mockRejectedValueOnce(new Error('rate limited'));

      await expect(describeAudio(Buffer.alloc(16 * 1024), 'thud.ogg')).resolves.toBeNull();
      expect(create).toHaveBeenCalledTimes(2);
    });
  });

  /**
   * The clips that hit this decode fine and their WAV headers were verified
   * canonical with the audio present - the model is just intermittently
   * answering as a text-only assistant. It usually clears on a resend, so one
   * more request is worth spending before the clip is left for a later sweep.
   */
  describe('a reply that answers as if no audio were attached', () => {
    const DEFLECTION = "I can't listen to the audio. Please upload the clip so I can help you.";

    function deflect() {
      return { choices: [{ message: { content: DEFLECTION } }] };
    }

    it('resends once and returns the description the second reply carried', async () => {
      const { describeAudio, create, warn } = loadWithStubs(Buffer.alloc(64 * 1024));
      create.mockResolvedValueOnce(deflect());

      await expect(describeAudio(Buffer.alloc(16 * 1024), 'bonk.ogg')).resolves.toEqual({
        kind: 'sound',
        caption: 'a thud',
        tags: ['thud'],
      });

      // Exactly two: the deflection and the resend. Not three, not a loop.
      expect(create).toHaveBeenCalledTimes(2);
      // The resend is the same request, byte for byte - including whether it
      // carries the JSON-object constraint. Rebuilding it any other way would
      // either re-probe a parameter the endpoint may have refused, or change
      // the variable under test.
      expect(create.mock.calls[1][0]).toEqual(create.mock.calls[0][0]);
      // A hiccup that resolved itself is not a warning.
      expect(warn).not.toHaveBeenCalled();
    });

    it('handles the curly-apostrophe spelling the model also emits', async () => {
      const { describeAudio, create } = loadWithStubs(Buffer.alloc(64 * 1024));
      create.mockResolvedValueOnce({
        choices: [{ message: { content: 'I can’t actually hear the audio clip.' } }],
      });

      await expect(describeAudio(Buffer.alloc(16 * 1024), 'bonk.ogg')).resolves.not.toBeNull();
      expect(create).toHaveBeenCalledTimes(2);
    });

    it('gives up after one resend and says so with the excerpt', async () => {
      const { describeAudio, create, warn } = loadWithStubs(Buffer.alloc(64 * 1024), DEFLECTION);

      await expect(describeAudio(Buffer.alloc(16 * 1024), 'bonk.ogg')).resolves.toBeNull();
      expect(create).toHaveBeenCalledTimes(2);
      expect(warn).toHaveBeenCalledTimes(1);
      const line = String(warn.mock.calls[0][0]);
      expect(line).toContain('bonk.ogg');
      expect(line).toContain('resend');
      expect(line).toContain("I can't listen to the audio");
    });

    it('does not resend a genuine content refusal', async () => {
      // No row is written either way, so the sweep retries the clip on a later
      // run. Resending here would buy the same refusal at twice the price -
      // and there is deliberately no terminal-refusal state to short-circuit.
      const { describeAudio, create, warn } = loadWithStubs(
        Buffer.alloc(64 * 1024),
        "I'm sorry, but I can't assist with that request."
      );

      await expect(describeAudio(Buffer.alloc(16 * 1024), 'salmon.ogg')).resolves.toBeNull();
      expect(create).toHaveBeenCalledTimes(1);
      const line = String(warn.mock.calls[0][0]);
      expect(line).toContain('salmon.ogg');
      // And it is logged as it was before, with no resend wording attached.
      expect(line).not.toContain('resend');
    });

    it('does not resend a reply that is merely unparseable', async () => {
      const { describeAudio, create } = loadWithStubs(
        Buffer.alloc(64 * 1024),
        '{"kind":"music","caption":"a clip","tags":[]}'
      );

      await expect(describeAudio(Buffer.alloc(16 * 1024), 'odd.ogg')).resolves.toBeNull();
      expect(create).toHaveBeenCalledTimes(1);
    });

    /**
     * The two retries in this file must compose additively, not multiply. A
     * resend routed back through `sendDescribeRequest` would re-run the
     * `response_format` probe, so a clip that paid a rejected parameter and
     * then deflected would cost four requests - and the resend could carry a
     * parameter the endpoint has already refused.
     */
    it('costs at most three requests when it follows a refused JSON-mode probe', async () => {
      const { describeAudio, create } = loadWithStubs(Buffer.alloc(64 * 1024));
      create.mockRejectedValueOnce(
        Object.assign(
          new Error(
            "400 Unsupported parameter: 'response_format' is not supported with this model."
          ),
          { status: 400, error: { param: 'response_format' } }
        )
      );
      create.mockResolvedValueOnce(deflect());

      await expect(describeAudio(Buffer.alloc(16 * 1024), 'bonk.ogg')).resolves.toEqual({
        kind: 'sound',
        caption: 'a thud',
        tags: ['thud'],
      });

      expect(create).toHaveBeenCalledTimes(3);
      // The rejected probe, then two bodies without it. The resend must not
      // reintroduce the parameter the endpoint just refused.
      expect(create.mock.calls[0][0]).toHaveProperty('response_format');
      expect(create.mock.calls[1][0]).not.toHaveProperty('response_format');
      expect(create.mock.calls[2][0]).not.toHaveProperty('response_format');
      expect(create.mock.calls[2][0]).toEqual(create.mock.calls[1][0]);
    });

    it('does not turn a repeated deflection into a loop', async () => {
      // Three clips, every reply a deflection: two requests each, never more.
      const { describeAudio, create } = loadWithStubs(Buffer.alloc(64 * 1024), DEFLECTION);

      const results = await Promise.all([
        describeAudio(Buffer.alloc(16 * 1024), 'one.ogg'),
        describeAudio(Buffer.alloc(16 * 1024), 'two.ogg'),
        describeAudio(Buffer.alloc(16 * 1024), 'three.ogg'),
      ]);

      expect(results).toEqual([null, null, null]);
      expect(create).toHaveBeenCalledTimes(6);
    });
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

  it('still fills the excerpt when the reply is mostly whitespace', async () => {
    // The helper slices its window before collapsing whitespace, so that the
    // whole reply is never copied just to log 300 characters of it. Collapsing
    // only shortens, so the window has to be wide enough that a padded reply
    // still yields a useful excerpt rather than a few characters.
    const reply = `sorry:${'\n '.repeat(400)}${'y'.repeat(400)}`;
    const { describeAudio, warn } = loadWithStubs(Buffer.alloc(1024), reply);

    await expect(describeAudio(Buffer.alloc(16 * 1024), 'bonk.ogg')).resolves.toBeNull();
    const line = String(warn.mock.calls[0][0]);
    expect(line).toContain('sorry:');
    expect(line).toContain('yyyy');
    expect(line).toContain('...');
    expect(line).not.toContain('\n');
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

  /**
   * Replaces a test that stubbed `toWavBuffer` to return a 9MB buffer and
   * asserted a now-deleted MAX_DECODED_BYTES guard rejected it. That state is
   * unreachable in production - `toWavBuffer` rejects while stdout is still
   * accumulating, at the same 8MB - so the test only ever proved the stub
   * worked. The bound itself is covered where it actually lives, by
   * audioTranscode.test.ts's 'kills ffmpeg and rejects if stdout exceeds the
   * byte ceiling'. What is left for this layer to promise is that a rejected
   * decode costs nothing further, which is what this asserts.
   */
  it('spends no model call when the decode is rejected for being oversized', async () => {
    const { describeAudio, toWav, create } = loadWithStubs(Buffer.alloc(16));
    toWav.mockRejectedValueOnce(
      new Error('ffmpeg output exceeded 8388608 bytes before the -t 30s cap stopped it')
    );

    await expect(describeAudio(Buffer.alloc(256 * 1024), 'dense.mp3')).resolves.toBeNull();
    expect(toWav).toHaveBeenCalledTimes(1);
    expect(create).not.toHaveBeenCalled();
  });

  it('caps the source at the transcription API upload limit of 25MB', async () => {
    // The same source buffer is handed to transcribeSpeech for any clip with
    // speech in it, so a source over the API's own 25MB upload limit could
    // never finish stage 2 regardless of what stage 1 made of it.
    const { MAX_ANALYZABLE_BYTES } = loadWithStubs(Buffer.alloc(16));
    // Decimal, not binary. A source between the two readings of "25 MB"
    // passes a 25 MiB check locally and is refused by the server - the same
    // fine-here-rejected-there shape these fixes exist to stop repeating.
    expect(MAX_ANALYZABLE_BYTES).toBe(25 * 1000 * 1000);
    expect(MAX_ANALYZABLE_BYTES).toBeLessThan(25 * 1024 * 1024);
  });

  it('analyses the 8.3MB clip the old 8MB cap rejected', async () => {
    const { describeAudio, toWav, create } = loadWithStubs(Buffer.alloc(64 * 1024));

    await expect(
      describeAudio(Buffer.alloc(Math.round(8.3 * 1024 * 1024)), 'long_clip.ogg')
    ).resolves.not.toBeNull();
    expect(toWav).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledTimes(1);
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
