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

const DEFAULT_CONCURRENCY = 3;

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

  // A stored transcript of NULL means "this clip has no speech in it". A clip
  // classified speech/mixed whose transcription failed is not that, and writing
  // the row anyway would record the failure as a finished analysis: the sweep
  // skips clips whose source_size is unchanged, so it would never be retried.
  let transcript: string | null = null;
  if (description.kind !== 'sound') {
    transcript = await transcribeSpeech(buffer, name);
    if (transcript === null) {
      log.warn(
        `Transcription produced nothing for ${name} (classified ${description.kind}) - leaving it unanalyzed so the sweep retries it`
      );
      return null;
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
    kind: description.kind,
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
  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;

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
