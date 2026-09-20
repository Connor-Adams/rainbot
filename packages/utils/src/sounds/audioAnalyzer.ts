import path from 'path';
import { loadConfig } from '../config';
import { createLogger } from '../logger';
import type { SoundDescription, SoundKind } from './types';

const log = createLogger('SOUND-ANALYZER');

const VALID_KINDS: SoundKind[] = ['speech', 'sound', 'mixed'];
const MAX_TAGS = 8;

export const DESCRIBE_PROMPT = `You are cataloguing short audio clips for a Discord soundboard so people can search for them later.

Listen to the clip and reply with JSON only, no prose and no code fence:
{"kind": "speech" | "sound" | "mixed", "caption": string, "tags": string[]}

- "speech": a person talking, and little else.
- "sound": a sound effect, noise, music sting, or animal - no intelligible speech.
- "mixed": intelligible speech over music or effects.
- caption: one short sentence naming what makes the clip recognizable - the source of the sound and its character. For speech, describe the speaker and delivery rather than repeating their words.
- tags: 3 to 8 short lowercase keyword phrases someone might actually search for.

If there is no intelligible speech, say so with "sound". Do not invent words that were not spoken.`;

/** Parses a model reply into a description, or null when it is unusable. */
export function parseDescription(raw: string): SoundDescription | null {
  const unfenced = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```$/, '')
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(unfenced);
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

function audioFormatFor(filename: string): string {
  const ext = path.extname(filename).toLowerCase().replace('.', '');
  if (ext === 'oga' || ext === 'opus') return 'ogg';
  if (ext === 'm4a') return 'mp4';
  return ext || 'ogg';
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

  let OpenAI: typeof import('openai').OpenAI;
  try {
    // openai is an optionalDependency; a missing package must degrade quietly.
     
    ({ OpenAI } = require('openai'));
  } catch {
    log.warn('openai package not installed - skipping audio description');
    return null;
  }

  try {
    const client = new OpenAI({ apiKey: config.openaiApiKey });
    const response = await client.chat.completions.create({
      model: config.soundCaptionModel,
      modalities: ['text'],
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: DESCRIBE_PROMPT },
            {
              type: 'input_audio',
              input_audio: {
                data: buffer.toString('base64'),
                format: audioFormatFor(filename),
              },
            },
          ],
        },
      ],
    } as Parameters<typeof client.chat.completions.create>[0]);

    const reply = (response as { choices?: Array<{ message?: { content?: string } }> }).choices?.[0]
      ?.message?.content;
    if (!reply) {
      log.warn(`Empty description reply for ${filename}`);
      return null;
    }

    const description = parseDescription(reply);
    if (!description) log.warn(`Unparseable description reply for ${filename}`);
    return description;
  } catch (error) {
    const err = error as Error;
    log.warn(`Audio description failed for ${filename}: ${err.message}`);
    return null;
  }
}
