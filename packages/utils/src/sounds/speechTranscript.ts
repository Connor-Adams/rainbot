import { loadConfig } from '../config';
import { createLogger } from '../logger';

const log = createLogger('SOUND-TRANSCRIPT');

export interface WhisperSegment {
  text: string;
  no_speech_prob?: number;
  avg_logprob?: number;
}

const MAX_NO_SPEECH_PROB = 0.6;
const MIN_AVG_LOGPROB = -1.0;

/**
 * Boilerplate Whisper emits over near-silence, learned from subtitle training
 * data. Classification means we rarely reach this list, but a clip that is
 * mostly effects with a word at the end can still trail into it.
 */
export const HALLUCINATION_PHRASES = [
  'thank you',
  'thanks for watching',
  'subtitles by the amara.org community',
  'subscribe',
  'bye',
  'you',
];

/**
 * Outcome of a transcription attempt.
 *
 * `transcribeSpeech` used to signal both "the request failed" and "the
 * request succeeded but there was no usable speech" with the same `null`,
 * which left `analyzeSound` unable to tell a transient failure (retry it)
 * apart from a clip that genuinely has no speech (store it and move on). A
 * clip whose only spoken content is hallucination-blacklisted ("you", "bye")
 * legitimately lands in the second case, and needs to be distinguishable
 * from the first.
 *
 * `ok: false` carries no reason - callers already log it here, and the only
 * thing a caller does with the distinction is decide whether to retry.
 */
export type TranscriptionResult = { ok: true; transcript: string | null } | { ok: false };

function isHallucination(text: string): boolean {
  const normalized = text
    .toLowerCase()
    .replace(/[^a-z0-9.\s]/g, '')
    .replace(/\.$/, '')
    .trim();
  return HALLUCINATION_PHRASES.includes(normalized);
}

/** Drops segments Whisper is not confident are speech, then joins the rest. */
export function trimHallucinations(segments: WhisperSegment[]): string {
  return segments
    .filter((segment) => (segment.no_speech_prob ?? 0) <= MAX_NO_SPEECH_PROB)
    .filter((segment) => (segment.avg_logprob ?? 0) >= MIN_AVG_LOGPROB)
    .map((segment) => segment.text.trim())
    .filter((text) => text.length > 0)
    .filter((text) => !isHallucination(text))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Transcribes a clip already classified as containing speech.
 *
 * Whisper is used here rather than the captioning model because the query
 * this serves is "the one where he says X" - verbatim fidelity is the whole
 * point, and a dedicated speech model is better at it.
 *
 * Returns `{ ok: false }` when the attempt itself failed (no key, package
 * missing, request error) - the caller should treat the clip as unanalyzed
 * and retry later. Returns `{ ok: true, transcript }` when the attempt
 * succeeded, where `transcript` is `null` if it genuinely found no usable
 * speech (see `TranscriptionResult`).
 */
export async function transcribeSpeech(
  buffer: Buffer,
  filename: string
): Promise<TranscriptionResult> {
  const config = loadConfig();
  if (!config.openaiApiKey) return { ok: false };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let OpenAI: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let toFile: any;
  try {
    // openai is an optionalDependency; a missing package must degrade quietly.
    ({ OpenAI, toFile } = require('openai'));
  } catch {
    log.warn('openai package not installed - skipping transcription');
    return { ok: false };
  }

  try {
    const client = new OpenAI({ apiKey: config.openaiApiKey });

    // Must go through the SDK's own `toFile`. Its multipart encoder only
    // accepts values that satisfy `isUploadable()` - a File/Blob, a fetch
    // Response, or an `fs.ReadStream`. A plain `stream.Readable` (even with
    // `.path` set, which only influences the derived filename) satisfies none
    // of them, and the request throws a TypeError before any network call -
    // which this function's catch would quietly turn into a failed attempt.
    const file = await toFile(buffer, filename);

    const response = await client.audio.transcriptions.create({
      file,
      model: 'whisper-1',
      response_format: 'verbose_json',
    });

    const segments = (response as unknown as { segments?: WhisperSegment[] }).segments;
    if (!segments) {
      const text = (response as unknown as { text?: string }).text ?? '';
      return { ok: true, transcript: text.trim() || null };
    }

    const trimmed = trimHallucinations(segments);
    return { ok: true, transcript: trimmed || null };
  } catch (error) {
    const err = error as Error;
    log.warn(`Transcription failed for ${filename}: ${err.message}`);
    return { ok: false };
  }
}
