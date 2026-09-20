import path from 'path';
import { loadConfig } from '../config';
import { createLogger } from '../logger';

const log = createLogger('SOUND-TRANSCRIPT');

/**
 * Content type to declare on the upload, keyed by the clip's extension.
 *
 * The SDK's `toFile` leaves the File's `type` empty unless it is handed one,
 * and the multipart part then carries no usable content type. The API rejects
 * that with `400 Invalid file format` whatever the filename says - which is
 * what production did for every single speech clip in the library. Verified
 * against the installed openai@4.104.0:
 *
 *   toFile(buf, 'clip.ogg')                        -> type: ""
 *   toFile(buf, 'clip.ogg', { type: 'audio/ogg' }) -> type: "audio/ogg"
 *
 * Deliberately not storage.ts's private `getContentType`. That one labels
 * objects for S3, where an unrecognised extension can safely degrade to
 * `application/octet-stream` and nobody minds; here an unrecognised type is a
 * rejected request. It also has no entry for `.oga` or `.opus`, both of which
 * this library actually contains. The two want different coverage and
 * different fallbacks, so they stay separate.
 */
const UPLOAD_CONTENT_TYPES: Record<string, string> = {
  '.ogg': 'audio/ogg',
  '.oga': 'audio/ogg',
  // Opus here is always Opus-in-Ogg: storage.ts transcodes every upload with
  // `-c:a libopus -f ogg`, so the container genuinely is Ogg and `audio/ogg`
  // describes the bytes correctly. It is also the only thing the API will
  // take - its supported list is ['flac', 'm4a', 'mp3', 'mp4', 'mpeg',
  // 'mpga', 'oga', 'ogg', 'wav', 'webm'], which names containers rather than
  // codecs: `oga`/`ogg` are on it and `opus` is not.
  '.opus': 'audio/ogg',
  '.webm': 'audio/webm',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.flac': 'audio/flac',
};

/**
 * What to declare for an extension the table does not know.
 *
 * `application/octet-stream` - storage.ts's fallback - is not on the API's
 * supported list, so it would fail exactly the way declaring nothing did.
 * Every object this soundboard stores is normalised to Ogg Opus
 * (`toOggFilename` / `transcodeToOggOpus`, and `getSoundBuffer` prefers the
 * `.ogg` copy), so Ogg is overwhelmingly the likely truth for anything whose
 * name is unfamiliar, and guessing it at least produces a request the API
 * will open and inspect instead of one it refuses on sight.
 */
const DEFAULT_UPLOAD_EXTENSION = '.ogg';
const DEFAULT_UPLOAD_CONTENT_TYPE = 'audio/ogg';

/**
 * The filename and content type a clip should be uploaded under.
 *
 * The API gates on the *filename extension* as well as on the content type:
 * its supported list - ['flac', 'm4a', 'mp3', 'mp4', 'mpeg', 'mpga', 'oga',
 * 'ogg', 'wav', 'webm'] - is checked against the multipart part's filename,
 * and a name outside it is refused with `400 Invalid file format` however the
 * part is typed. That is the position this function takes, and it has exactly
 * one consequence: a name whose extension the API will not accept is renamed
 * to the extension matching the type being declared, so the two always agree.
 *
 * `.opus` is the familiar case - the list has no `opus` entry while the bytes
 * are an ordinary Ogg container - but the unknown-extension fallback needs the
 * same treatment for the same reason. Leaving `clip.aiff` named `clip.aiff`
 * while declaring `audio/ogg` is a name the server rejects on sight paired
 * with a type contradicting it; if the rename is pointless there it was
 * pointless for `.opus` too, and production's `400 Invalid file format` says
 * it is not.
 *
 * Exported for the tests, which assert the content type that actually reaches
 * the API rather than merely that the value is uploadable.
 */
export function uploadDescriptorFor(filename: string): {
  uploadName: string;
  contentType: string;
} {
  const ext = path.extname(filename);
  const known = UPLOAD_CONTENT_TYPES[ext.toLowerCase()];
  const contentType = known ?? DEFAULT_UPLOAD_CONTENT_TYPE;

  // `.opus` carries a type the API takes but a name it does not, so it is
  // renamed alongside every extension the table has no entry for at all.
  const acceptedAsIs = known !== undefined && ext.toLowerCase() !== '.opus';
  const stem = ext ? filename.slice(0, -ext.length) : filename;
  const uploadName = acceptedAsIs ? filename : `${stem}${DEFAULT_UPLOAD_EXTENSION}`;

  return { uploadName, contentType };
}

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
    //
    // Satisfying `isUploadable()` is necessary but not sufficient: it only
    // proves the request can be *built*. The content type is what decides
    // whether the server accepts it, and `toFile` will not infer one from the
    // filename (see UPLOAD_CONTENT_TYPES), so it has to be stated.
    const { uploadName, contentType } = uploadDescriptorFor(filename);
    const file = await toFile(buffer, uploadName, { type: contentType });

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
