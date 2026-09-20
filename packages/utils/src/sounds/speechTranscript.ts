import { Readable } from 'stream';
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
 */
export async function transcribeSpeech(buffer: Buffer, filename: string): Promise<string | null> {
  const config = loadConfig();
  if (!config.openaiApiKey) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let OpenAI: any;
  try {
    // openai is an optionalDependency; a missing package must degrade quietly.
     
    ({ OpenAI } = require('openai'));
  } catch {
    log.warn('openai package not installed - skipping transcription');
    return null;
  }

  try {
    const client = new OpenAI({ apiKey: config.openaiApiKey });
    const stream = Readable.from(buffer) as Readable & { path?: string };
    stream.path = filename;

    const response = await client.audio.transcriptions.create({
      file: stream,
      model: 'whisper-1',
      response_format: 'verbose_json',
    });

    const segments = (response as unknown as { segments?: WhisperSegment[] }).segments;
    if (!segments) {
      const text = (response as unknown as { text?: string }).text ?? '';
      return text.trim() || null;
    }

    const trimmed = trimHallucinations(segments);
    return trimmed || null;
  } catch (error) {
    const err = error as Error;
    log.warn(`Transcription failed for ${filename}: ${err.message}`);
    return null;
  }
}
