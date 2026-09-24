import { loadConfig } from '../config';
import { createLogger } from '../logger';
import { getSoundBuffer, listSounds } from '../storage';
import { describeAudio } from './audioAnalyzer';
import { transcribeSpeech } from './speechTranscript';
import { embedText } from './embeddings';
import { upsertAnalysis, getAnalysisSizes, detectVectorSupport } from './analysisRepo';
import { buildSearchDoc } from './searchText';
import type { SoundAnalysis } from './types';

const log = createLogger('SOUND-ANALYZE');

/**
 * How many clips may be analyzed at once.
 *
 * Every analysis spawns an ffmpeg to decode the clip and then calls an audio
 * model, so this is the ceiling on both. The sweep uses it as its batch size
 * and `enqueueAnalyzeSound` as its queue width - one number, because they
 * bound the same resource.
 */
export const ANALYSIS_CONCURRENCY = 3;

export interface AnalyzeOptions {
  displayName?: string | null;
  size?: number | null;
}

/**
 * Reads one clip and stores what it is.
 *
 * Stage 1 classifies; stage 2 transcribes only when stage 1 found speech.
 * Returning null leaves the clip unanalyzed - a failure must not write a row,
 * or the sweep would count a transient outage as work done and never retry.
 */
export async function analyzeSound(
  name: string,
  options: AnalyzeOptions = {}
): Promise<SoundAnalysis | null> {
  const config = loadConfig();
  if (!config.soundAnalysisEnabled) return null;

  let buffer: Buffer;
  try {
    buffer = await getSoundBuffer(name);
  } catch (error) {
    const err = error as Error;
    log.warn(`Could not read ${name} for analysis: ${err.message}`);
    return null;
  }

  const description = await describeAudio(buffer, name);
  if (!description) return null;

  // `transcript` carries three states, and they are not interchangeable (see
  // SoundAnalysis.transcript in types.ts):
  //
  //   NULL  - no speech present; transcription was never attempted.
  //   ''    - speech was heard, but no usable words came back.
  //   text  - the transcript.
  //
  // A *failed* attempt is none of the three. Writing a row for it would record
  // the failure as a finished analysis, and the sweep skips clips whose
  // source_size is unchanged, so it would never be retried. Return null and
  // leave the clip for a later sweep.
  //
  // A *succeeded* attempt that found nothing usable is genuinely done -
  // re-running it every sweep forever would never produce a different answer -
  // so it is stored, as ''. `kind` is left exactly as the classifier reported
  // it. The two fields answer independent questions: `kind` is what is in the
  // audio, `transcript` is what words are recoverable from it, and rewriting
  // the first because the second came back empty conflates them lossily and
  // in one direction only. HALLUCINATION_PHRASES includes 'bye', 'you' and
  // 'thank you', so a clip whose entire content is someone shouting "Bye!" is
  // classified speech, transcribed correctly, trimmed to nothing by the
  // blacklist - and would then have been stored forever as a sound effect
  // with no speech in it. One-word interjections are exactly what people put
  // on a soundboard. For a `mixed` clip it was plainly incoherent: caption
  // 'shouting over a beat', tags ['shout'], kind 'sound'.
  let transcript: string | null = null;
  const kind = description.kind;
  if (kind !== 'sound') {
    const result = await transcribeSpeech(buffer, name);
    if (!result.ok) {
      log.warn(
        `Transcription failed for ${name} (classified ${kind}) - leaving it unanalyzed so the sweep retries it`
      );
      return null;
    }
    transcript = result.transcript ?? '';
    if (transcript === '') {
      log.info(
        `Transcription of ${name} recovered no usable words (classified ${kind}) - storing an empty transcript and keeping kind=${kind}`
      );
    }
  }

  const searchDoc = buildSearchDoc({
    name,
    displayName: options.displayName ?? null,
    transcript,
    caption: description.caption,
    tags: description.tags,
  });

  const analysis: SoundAnalysis = {
    soundName: name,
    kind,
    transcript,
    caption: description.caption,
    tags: description.tags,
    searchDoc,
    sourceSize: options.size ?? buffer.length,
    model: config.soundCaptionModel,
  };

  const embedding = await embedText(searchDoc);
  await upsertAnalysis(analysis, embedding);

  log.info(`Analyzed ${name} as ${analysis.kind}`);
  return analysis;
}

let activeAnalyses = 0;
const analysisQueue: Array<() => void> = [];

function startNextQueuedAnalysis(): void {
  activeAnalyses -= 1;
  const next = analysisQueue.shift();
  if (next) next();
}

/** How many queued analyses are running or waiting. Exposed for tests. */
export function pendingAnalysisCount(): { active: number; queued: number } {
  return { active: activeAnalyses, queued: analysisQueue.length };
}

/**
 * Queues a clip for analysis without waiting for it.
 *
 * Callers that analyze on demand - an upload request may carry ten files -
 * must not fan out ten ffmpeg spawns and ten audio-model calls at once. This
 * repo has production history of `spawn ffmpeg EAGAIN` under burst load. The
 * queue is bounded by the same ANALYSIS_CONCURRENCY the sweep batches at, and
 * every rejection is absorbed here so nothing escapes as an unhandled
 * rejection; a clip that fails is simply retried by the next sweep.
 */
export function enqueueAnalyzeSound(name: string, options: AnalyzeOptions = {}): void {
  const run = (): void => {
    activeAnalyses += 1;
    void analyzeSound(name, options)
      .catch((error) => {
        const err = error as Error;
        log.warn(`Queued analysis failed for ${name}: ${err.message}`);
      })
      .finally(startNextQueuedAnalysis);
  };

  if (activeAnalyses < ANALYSIS_CONCURRENCY) run();
  else analysisQueue.push(run);
}

export interface SweepOptions {
  force?: boolean;
  limit?: number;
  concurrency?: number;
}

/**
 * Backfills analysis across the library, skipping clips that have not changed.
 *
 * Counter semantics: `skipped` counts every clip in the *entire* library that is
 * already up to date (computed before `limit` truncates the work queue), while
 * `analyzed` and `failed` count only the clips this run actually attempted
 * (after truncation). With a `limit` set, these three numbers do not add up to
 * the size of the library - the untruncated remainder of the pending queue is
 * left for a subsequent run and appears in none of them. Callers building a
 * progress indicator should account for that gap rather than assuming full
 * coverage.
 */
export async function sweepAnalyzeSounds(
  options: SweepOptions = {}
): Promise<{ analyzed: number; skipped: number; failed: number }> {
  const force = options.force ?? false;
  const limit = options.limit ?? 0;
  const concurrency = options.concurrency ?? ANALYSIS_CONCURRENCY;

  await detectVectorSupport();

  const sounds = await listSounds();
  const knownSizes = await getAnalysisSizes();

  let analyzed = 0;
  let skipped = 0;
  let failed = 0;

  const pending = sounds.filter((sound) => {
    if (force) return true;
    if (!knownSizes.has(sound.name)) return true;
    if (knownSizes.get(sound.name) !== sound.size) return true;
    skipped += 1;
    return false;
  });

  const queue = limit > 0 ? pending.slice(0, limit) : pending;

  for (let i = 0; i < queue.length; i += concurrency) {
    const batch = queue.slice(i, i + concurrency);
    const results = await Promise.all(
      batch.map(async (sound) => {
        try {
          return await analyzeSound(sound.name, { size: sound.size });
        } catch (error) {
          const err = error as Error;
          log.warn(`Analyze failed for ${sound.name}: ${err.message}`);
          return null;
        }
      })
    );
    for (const result of results) {
      if (result) analyzed += 1;
      else failed += 1;
    }
  }

  log.info(`Sweep complete: ${analyzed} analyzed, ${skipped} skipped, ${failed} failed`);
  return { analyzed, skipped, failed };
}
