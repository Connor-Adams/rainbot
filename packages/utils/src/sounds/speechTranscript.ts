import path from 'path';
import { loadConfig } from '../config';
import { createLogger } from '../logger';

const log = createLogger('SOUND-TRANSCRIPT');

/**
 * A container the transcription API accepts, with the extension and content
 * type that describe it.
 *
 * The API gates on both halves. The SDK's `toFile` leaves the File's `type`
 * empty unless it is handed one, and the multipart part then carries no usable
 * content type; the API rejects that with `400 Invalid file format` whatever
 * the filename says - which is what production did for every single speech
 * clip in the library. Verified against the installed openai@4.104.0:
 *
 *   toFile(buf, 'clip.ogg')                        -> type: ""
 *   toFile(buf, 'clip.ogg', { type: 'audio/ogg' }) -> type: "audio/ogg"
 *
 * The filename's extension is checked too, against the supported list
 * ['flac', 'm4a', 'mp3', 'mp4', 'mpeg', 'mpga', 'oga', 'ogg', 'wav', 'webm'],
 * which names containers rather than codecs. Pairing the two in one value is
 * what keeps them from disagreeing.
 */
interface UploadContainer {
  extension: string;
  contentType: string;
}

const OGG: UploadContainer = { extension: '.ogg', contentType: 'audio/ogg' };
const WEBM: UploadContainer = { extension: '.webm', contentType: 'audio/webm' };
const WAV: UploadContainer = { extension: '.wav', contentType: 'audio/wav' };
const FLAC: UploadContainer = { extension: '.flac', contentType: 'audio/flac' };
const MP4: UploadContainer = { extension: '.m4a', contentType: 'audio/mp4' };
const MP3: UploadContainer = { extension: '.mp3', contentType: 'audio/mpeg' };

/**
 * The container a clip's leading bytes actually are, or null when they are
 * none this API accepts.
 *
 * This exists because the caller's filename is not evidence about the bytes.
 * `getSoundBuffer` -> `getSoundStream` -> `resolveSoundFilename` silently
 * prefers the transcoded `.ogg` copy of a clip, and
 * `SOUND_TRANSCODE_DELETE_ORIGINAL` defaults to false, so `listSounds()`
 * returns both `laugh.mp3` and `laugh.ogg` and `analyzeSound` then hands
 * `transcribeSpeech` the name `laugh.mp3` attached to Ogg Opus bytes. Keying
 * the content type off that name declared MP3 over an Ogg payload for every
 * `.mp3`/`.wav`/`.m4a`/`.flac` entry in the library - the whole pre-transcode
 * backfill population.
 *
 * Reading the bytes is the one answer that cannot drift: it consults
 * `resolveSoundFilename` not at all, so no future change to which object that
 * function picks can desynchronise it. The alternative -
 * `getSoundStreamWithName`'s resolved name - would still be a name-based
 * inference one indirection further out (storage.ts itself notes that a
 * `.ogg` key may hold Vorbis), and costs a second S3 HEAD per clip.
 *
 * Signatures are checked in order of specificity; the bare MPEG frame sync
 * last, since it is the loosest of them.
 */
function sniffUploadContainer(buffer: Buffer): UploadContainer | null {
  const head = buffer.subarray(0, 16);
  const at = (offset: number, length: number): string =>
    head.length >= offset + length ? head.subarray(offset, offset + length).toString('latin1') : '';

  if (at(0, 4) === 'OggS') return OGG;
  if (head.length >= 4 && head.readUInt32BE(0) === 0x1a45dfa3) return WEBM; // EBML, i.e. WebM/Matroska
  if (at(0, 4) === 'RIFF' && at(8, 4) === 'WAVE') return WAV;
  if (at(0, 4) === 'fLaC') return FLAC;
  if (at(4, 4) === 'ftyp') return MP4;
  if (at(0, 3) === 'ID3') return MP3;
  // A bare MPEG audio frame: 0xFF then eleven set sync bits.
  if (head.length >= 2 && head.readUInt8(0) === 0xff && (head.readUInt8(1) & 0xe0) === 0xe0) {
    return MP3;
  }

  return null;
}

/**
 * Container to assume for bytes no signature matched, keyed by extension.
 *
 * Only reached when the sniff above came back empty, which for this library
 * means bytes in some container the API would refuse anyway. The name is then
 * the only evidence left, and it is better than nothing: unidentifiable bytes
 * called `clip.mp3` are likelier MP3 than Ogg.
 *
 * `.opus` and `.oga` are deliberately absent. Both are unreachable - the
 * multer `fileFilter` and `listSounds` share the pattern
 * `/\.(mp3|wav|ogg|m4a|webm|flac)$/i`, so neither extension can enter the
 * library - and a real Opus-in-Ogg or Ogg-Vorbis payload is identified by its
 * `OggS` magic regardless of what it is called.
 */
const FALLBACK_CONTAINERS: Record<string, UploadContainer> = {
  '.ogg': OGG,
  '.webm': WEBM,
  '.wav': WAV,
  '.flac': FLAC,
  '.m4a': MP4,
  '.mp3': MP3,
};

/**
 * Container to assume when neither the bytes nor the name identify one.
 *
 * `application/octet-stream` - storage.ts's fallback - is not on the API's
 * supported list, so it would fail exactly the way declaring nothing did.
 * Every object this soundboard stores is normalised to Ogg Opus
 * (`toOggFilename` / `transcodeToOggOpus`, and `getSoundBuffer` prefers the
 * `.ogg` copy), so Ogg is the likeliest truth for anything unidentified, and
 * guessing it at least produces a request the API will open and inspect
 * instead of one it refuses on sight.
 */
const DEFAULT_CONTAINER = OGG;

/**
 * The filename and content type a clip should be uploaded under.
 *
 * Derived from what the bytes are, not from what the caller called them - see
 * `sniffUploadContainer` for why those differ in production. The name is
 * rewritten to the sniffed container's extension whenever it does not already
 * carry exactly that extension, so the declared type, the declared name and
 * the payload all agree. That subsumes the old special cases: `.opus` holds an
 * Ogg container and so becomes `.ogg`, `.MP3` becomes `.mp3` because the API's
 * supported list is lowercase, and an extension the API does not accept is
 * replaced rather than sent alongside a type contradicting it.
 *
 * Exported for the tests, which assert the content type that actually reaches
 * the API rather than merely that the value is uploadable.
 */
export function uploadDescriptorFor(
  filename: string,
  buffer: Buffer
): {
  uploadName: string;
  contentType: string;
} {
  const ext = path.extname(filename);
  const container =
    sniffUploadContainer(buffer) ?? FALLBACK_CONTAINERS[ext.toLowerCase()] ?? DEFAULT_CONTAINER;

  const stem = ext ? filename.slice(0, -ext.length) : filename;
  // Compared case-sensitively, so an extension that is merely a case variant of
  // the container's is rewritten rather than kept. The API states its supported
  // list in lowercase - ['flac', 'm4a', 'mp3', ...] - and this function's
  // whole job is to emit a name whose extension is literally on that list.
  // Lowercasing to *find* the container is right (`.MP3` is an mp3); keeping
  // the original name once one is found was not, and made `uploadName` the one
  // output of this function that could carry an extension the list does not
  // contain.
  //
  // Reachable, not theoretical: the library's extension filters are
  // case-insensitive (`/\.(mp3|wav|ogg|m4a|webm|flac)$/i` in both the multer
  // `fileFilter` and `listSounds`), so `CLIP.MP3` can enter the library, and
  // `uploadSound` only lowercases the extension when the transcode succeeds -
  // its catch keeps the original name and bytes.
  const uploadName = ext === container.extension ? filename : `${stem}${container.extension}`;

  return { uploadName, contentType: container.contentType };
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
    // proves the request can be *built*. The declared name and content type
    // are what decide whether the server accepts it, and `toFile` will not
    // infer either (see `uploadDescriptorFor`), so both have to be stated -
    // and stated about the buffer, which is the only thing here that is
    // certainly the payload. `filename` may name a source object whose bytes
    // were replaced by a transcoded copy before they reached this function.
    const { uploadName, contentType } = uploadDescriptorFor(filename, buffer);
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
