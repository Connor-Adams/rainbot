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
   * Verbatim speech, or null when the clip contains none.
   *
   * null means "no speech is present", never "we tried and got nothing" - the
   * transcription step does not run at all on a clip classified as `sound`.
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
