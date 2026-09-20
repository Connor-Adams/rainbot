import { normalizeForSearch } from './searchText';

export type MatchSource = 'name' | 'transcript' | 'caption' | 'semantic';

export interface RankedList {
  source: MatchSource;
  names: string[];
}

export interface FusedHit {
  name: string;
  score: number;
  sources: MatchSource[];
}

/** Standard RRF damping constant. Larger values flatten rank differences. */
const DEFAULT_K = 60;

/**
 * Fuses several ranked lists by rank rather than by score.
 *
 * A lexical rank and a cosine distance have no common scale, so blending them
 * with weights is guesswork that silently misranks. RRF only reads position,
 * which makes it immune to that mismatch: a result several independent
 * strategies agree on rises, whichever strategy scored it how.
 */
export function fuseRankings(lists: RankedList[], k: number = DEFAULT_K): FusedHit[] {
  const scores = new Map<string, { score: number; sources: MatchSource[] }>();

  for (const list of lists) {
    const seen = new Set<string>();
    list.names.forEach((name, index) => {
      if (seen.has(name)) return;
      seen.add(name);

      const entry = scores.get(name) ?? { score: 0, sources: [] };
      entry.score += 1 / (k + index + 1);
      if (!entry.sources.includes(list.source)) entry.sources.push(list.source);
      scores.set(name, entry);
    });
  }

  return [...scores.entries()]
    .map(([name, entry]) => ({ name, score: entry.score, sources: entry.sources }))
    .sort((a, b) => b.score - a.score);
}

/**
 * Lifts hits whose normalized name starts with the normalized query.
 *
 * Typing most of a filename is an unambiguous statement of intent, and no
 * amount of semantic similarity should outrank it.
 */
export function pinExactPrefix(hits: FusedHit[], query: string): FusedHit[] {
  const normalizedQuery = normalizeForSearch(query);
  if (!normalizedQuery) return hits;

  const pinned: FusedHit[] = [];
  const rest: FusedHit[] = [];

  for (const hit of hits) {
    if (normalizeForSearch(hit.name).startsWith(normalizedQuery)) pinned.push(hit);
    else rest.push(hit);
  }

  return [...pinned, ...rest];
}
