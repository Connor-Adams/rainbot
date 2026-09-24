import type { MatchSource } from './rankFusion';

/** What a clip fundamentally is, which decides how it gets read. */
export type SoundKind = 'speech' | 'sound' | 'mixed';

export interface SoundDescription {
  kind: SoundKind;
  caption: string;
  tags: string[];
}

export interface SoundAnalysis {
  soundName: string;
  kind: SoundKind;
  /**
   * What words are recoverable from the clip, in three states:
   *
   * - `null` - no speech is present; transcription was never attempted. Only
   *   a clip classified `sound` reaches this, because that classification is
   *   what skips the transcription step.
   * - `''` - speech was heard, but no usable words were recovered. The
   *   attempt ran and finished; every segment fell to the confidence filters
   *   or the hallucination blacklist. A clip whose whole content is "Bye!"
   *   lands here, since 'bye' is blacklisted.
   * - non-empty - the transcript.
   *
   * A transcription attempt that *failed* is none of these. It writes no row
   * at all, so the sweep retries the clip rather than recording an outage as
   * a finished analysis.
   *
   * This is independent of `kind`, deliberately. `kind` answers "what is in
   * this audio" and is whatever the classifier reported; `transcript` answers
   * "what words came back". `kind: 'speech'` with `transcript: ''` is a
   * coherent, common row - a shouted one-word clip - not a contradiction.
   */
  transcript: string | null;
  caption: string;
  tags: string[];
  searchDoc: string;
  sourceSize: number | null;
  model: string;
}

export interface SoundSearchResult {
  name: string;
  score: number;
  matchedOn: MatchSource;
  /** Text explaining the match, shown in the UI. Null for a plain name match. */
  snippet: string | null;
}
