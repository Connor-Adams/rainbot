import { loadConfig } from '../config';
import { createLogger } from '../logger';
import { toWavBuffer, wasDecodeTruncated, MAX_DECODE_SECONDS } from './audioTranscode';
import type { SoundDescription, SoundKind } from './types';

const log = createLogger('SOUND-ANALYZER');

const VALID_KINDS: SoundKind[] = ['speech', 'sound', 'mixed'];
const MAX_TAGS = 8;

/**
 * Largest clip this will attempt, applied to both the source object and the
 * decoded WAV.
 *
 * The decoded PCM is base64-encoded inline into a JSON request body, so a clip
 * costs roughly 3x its decoded size in resident memory before the request is
 * even serialized. Multer accepts 50MB per upload; a 50MB MP3 decodes to about
 * 96MB of 16kHz mono PCM, ~128MB base64, on the order of 300MB resident for one
 * clip - about 1GB at the sweep's concurrency of 3, enough to exhaust a normal
 * container. The API would reject a body that size anyway.
 *
 * 8MB of 16kHz mono 16-bit PCM is about four minutes of audio. A soundboard
 * clip is seconds long, so this is far above anything legitimate while
 * capping one clip at roughly 30MB resident and the whole sweep under 100MB.
 * The same number guards the source buffer, which catches an oversized upload
 * before ffmpeg is even spawned; a compressed file that slips under it is
 * caught again after decoding.
 *
 * `toWavBuffer`'s own `MAX_DECODE_SECONDS` cap (audioTranscode.ts) now bounds
 * decoded output to under 1MB regardless of source size, so this post-decode
 * check is a backstop rather than the primary bound - it only matters if that
 * duration cap is ever raised or bypassed.
 */
export const MAX_ANALYZABLE_BYTES = 8 * 1024 * 1024;

function describeSize(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

export const DESCRIBE_PROMPT = `You are cataloguing short audio clips for a Discord soundboard so people can search for them later.

Listen to the clip and reply with JSON only, no prose and no code fence:
{"kind": "speech" | "sound" | "mixed", "caption": string, "tags": string[]}

- "speech": a person talking, and little else.
- "sound": a sound effect, noise, music sting, or animal - no intelligible speech.
- "mixed": intelligible speech over music or effects.
- caption: one short sentence naming what makes the clip recognizable - the source of the sound and its character. For speech, describe the speaker and delivery rather than repeating their words.
- tags: 3 to 8 short lowercase keyword phrases someone might actually search for.

If there is no intelligible speech, say so with "sound". Do not invent words that were not spoken.`;

/**
 * Characters of a rejected reply to put in the log.
 *
 * Enough to see the shape of what came back - a fence, a lead-in sentence, a
 * refusal - without pasting a whole model response into the log on every
 * failed clip. The excerpt goes on the existing single warn line rather than
 * a line of its own, so a library-wide failure costs no more log volume than
 * it did before, and a refusal is bounded at this length.
 */
const MAX_LOGGED_REPLY_CHARS = 300;

/** A bounded, single-line rendering of a model reply, for logs. */
function excerptReply(raw: string): string {
  const flattened = raw.replace(/\s+/g, ' ').trim();
  return flattened.length > MAX_LOGGED_REPLY_CHARS
    ? `${flattened.slice(0, MAX_LOGGED_REPLY_CHARS)}...`
    : flattened;
}

/**
 * Every balanced `{...}` span in a reply, outermost first, in order.
 *
 * The model is asked for bare JSON and `response_format` asks the API to
 * enforce it, but neither is a guarantee: the original `gpt-4o-audio-preview`
 * obliged and its replacement does not reliably, wrapping the object in a
 * lead-in sentence or a fenced block. Requiring the *whole* string to parse
 * threw all of those away.
 *
 * The scan is string-aware. A naive "first `{` to last `}`" - or any regex -
 * breaks on a caption that contains a brace, which is a caption a soundboard
 * will eventually produce, and a quoted brace must not open or close a span.
 * Escapes are tracked so a `\"` inside a string does not end it.
 *
 * Several spans are returned rather than one because prose can contain braces
 * of its own before the real object; the caller tries each until one
 * validates. Nested objects are not returned separately - only spans that
 * start at depth zero - so a sub-object can never be mistaken for the reply.
 */
function jsonObjectSpans(text: string): string[] {
  const spans: string[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }

    if (char === '"') {
      inString = true;
    } else if (char === '{') {
      if (depth === 0) start = i;
      depth += 1;
    } else if (char === '}') {
      // A stray closer in prose, with nothing open - ignore it rather than
      // letting depth go negative and desynchronise every later span.
      if (depth === 0) continue;
      depth -= 1;
      if (depth === 0 && start >= 0) {
        spans.push(text.slice(start, i + 1));
        start = -1;
      }
    }
  }

  return spans;
}

/** Parses a model reply into a description, or null when it is unusable. */
export function parseDescription(raw: string): SoundDescription | null {
  for (const span of jsonObjectSpans(raw)) {
    const description = parseJsonObject(span);
    if (description) return description;
  }
  return null;
}

function parseJsonObject(span: string): SoundDescription | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(span);
  } catch {
    return null;
  }

  if (typeof parsed !== 'object' || parsed === null) return null;
  const candidate = parsed as { kind?: unknown; caption?: unknown; tags?: unknown };

  if (typeof candidate.kind !== 'string') return null;
  if (!VALID_KINDS.includes(candidate.kind as SoundKind)) return null;
  if (typeof candidate.caption !== 'string') return null;

  const tags = Array.isArray(candidate.tags)
    ? candidate.tags
        .filter((tag): tag is string => typeof tag === 'string')
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0)
        .slice(0, MAX_TAGS)
    : [];

  return { kind: candidate.kind as SoundKind, caption: candidate.caption.trim(), tags };
}

/**
 * Minimal shape of the chat-completions request this call needs.
 *
 * Deliberately not imported from 'openai' - that package is an optional
 * dependency (see the `require('openai')` below), and referencing its types
 * here would reintroduce a compile-time dependency on a package that may not
 * be installed. The `format` union mirrors the SDK's own
 * `format: 'wav' | 'mp3'` (node_modules/openai/resources/chat/completions/completions.d.ts)
 * so a typo or a reintroduced non-wav format still fails to compile.
 */
interface AudioChatCompletionRequest {
  model: string;
  modalities: ['text'];
  /**
   * Asks the API to constrain the reply to a JSON object, rather than hoping
   * the prompt alone is obeyed. Mirrors the SDK's
   * `Shared.ResponseFormatJSONObject` (`type: 'json_object'`), one of the
   * three members of the `response_format` union on
   * node_modules/openai/resources/chat/completions/completions.d.ts:1117 -
   * so, like the audio `format` union below, a typo still fails to compile
   * without importing the optional package's types.
   *
   * The parser stays tolerant regardless: this is a request, and a model that
   * ignores or does not support it must not take the pipeline down with it.
   */
  response_format: { type: 'json_object' };
  messages: [
    {
      role: 'user';
      content: [
        { type: 'text'; text: string },
        { type: 'input_audio'; input_audio: { data: string; format: 'wav' | 'mp3' } },
      ];
    },
  ];
}

/**
 * Classifies and captions a clip in a single call.
 *
 * Returns null on any failure - a missing key, a missing package, a refusal,
 * an unparseable reply. A null must leave the clip unanalyzed rather than
 * writing an empty row, so a transient outage does not mark the whole library
 * as done.
 */
export async function describeAudio(
  buffer: Buffer,
  filename: string
): Promise<SoundDescription | null> {
  const config = loadConfig();
  if (!config.openaiApiKey) {
    log.debug('No OpenAI API key configured - skipping audio description');
    return null;
  }

  if (buffer.length > MAX_ANALYZABLE_BYTES) {
    log.warn(
      `Skipping ${filename}: ${describeSize(buffer.length)} exceeds the ${describeSize(MAX_ANALYZABLE_BYTES)} analysis limit`
    );
    return null;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let OpenAI: any;
  try {
    // openai is an optionalDependency; a missing package must degrade quietly.
    ({ OpenAI } = require('openai'));
  } catch {
    log.warn('openai package not installed - skipping audio description');
    return null;
  }

  try {
    const client = new OpenAI({ apiKey: config.openaiApiKey });

    // The chat-completions audio input only accepts 'wav' | 'mp3' (unlike
    // the Whisper transcriptions endpoint, which also takes ogg/webm/etc.),
    // and this soundboard transcodes every upload to Ogg Opus - so every
    // clip must be decoded to wav here rather than trusting the source
    // extension. A conversion failure falls through to the catch below and
    // returns null like every other failure in this function.
    const wavBuffer = await toWavBuffer(buffer);

    // The `-t` cap silently hands back a prefix, and the row that results is
    // written with the *full* source size, so the sweep's source_size skip
    // never revisits it. Nothing else records that the caption describes only
    // part of the clip, so say so here.
    //
    // The asymmetry is deliberate, not an oversight: `transcribeSpeech` is
    // given the original buffer, so the transcript still covers the whole
    // clip while the caption and tags cover its opening. Truncating the
    // transcript to match would delete recoverable words - exactly the words
    // a "the one where he says X" query needs, and exactly on the long clips
    // where a name match is least likely to help. The two fields already
    // answer different questions, so the honest resolution is a partial
    // caption that is known to be partial, not a transcript made worse for
    // symmetry's sake.
    //
    // Only the decoded duration is known here; the source's true length would
    // cost a second ffmpeg spawn per clip, and this repo has production
    // history of `spawn ffmpeg EAGAIN` under burst load.
    if (wasDecodeTruncated(wavBuffer)) {
      log.warn(
        `${filename} runs to at least the ${MAX_DECODE_SECONDS}s decode cap (source ${describeSize(buffer.length)}): ` +
          `its caption and tags describe only the first ${MAX_DECODE_SECONDS}s, while its transcript still covers the whole clip. ` +
          `Soundboard clips are seconds long, so this is probably not one.`
      );
    }

    // A small compressed source can still decode to an enormous WAV, so the
    // limit is re-applied to what is actually about to be base64-encoded.
    if (wavBuffer.length > MAX_ANALYZABLE_BYTES) {
      log.warn(
        `Skipping ${filename}: decodes to ${describeSize(wavBuffer.length)}, over the ${describeSize(MAX_ANALYZABLE_BYTES)} analysis limit`
      );
      return null;
    }

    const request: AudioChatCompletionRequest = {
      model: config.soundCaptionModel,
      modalities: ['text'],
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: DESCRIBE_PROMPT },
            {
              type: 'input_audio',
              input_audio: {
                data: wavBuffer.toString('base64'),
                format: 'wav',
              },
            },
          ],
        },
      ],
    };

    const response = await client.chat.completions.create(request);

    const reply = (response as { choices?: Array<{ message?: { content?: string } }> }).choices?.[0]
      ?.message?.content;
    if (!reply) {
      log.warn(`Empty description reply for ${filename}`);
      return null;
    }

    const description = parseDescription(reply);
    // Without the reply itself this line is undiagnosable - it took a dig
    // through production logs to establish that a model swap, not moderation,
    // was rejecting the whole library. The excerpt is bounded and flattened
    // (see MAX_LOGGED_REPLY_CHARS) because the reply may well be a refusal,
    // and it rides the same single warn line so the log volume is unchanged.
    if (!description) {
      log.warn(`Unparseable description reply for ${filename}: ${excerptReply(reply)}`);
    }
    return description;
  } catch (error) {
    const err = error as Error;
    log.warn(`Audio description failed for ${filename}: ${err.message}`);
    return null;
  }
}
