import { createLogger } from '../logger';
import { normalizeForSearch } from './searchText';
import { fuseRankings, pinExactPrefix, type MatchSource, type RankedList } from './rankFusion';
import { lexicalSearch, vectorSearch, getAnalysisFor } from './analysisRepo';
import { embedText, shouldUseSemantic } from './embeddings';
import type { SoundAnalysis, SoundSearchResult } from './types';

const log = createLogger('SOUND-SEARCH');

const DEFAULT_LIMIT = 50;

export interface SearchableSound {
  name: string;
  displayName?: string | null;
}

export interface SearchOptions {
  query: string;
  sounds: SearchableSound[];
  limit?: number;
  /** Discord autocomplete sets this false to stay inside its latency budget. */
  allowSemantic?: boolean;
}

/**
 * Matches filenames in memory, with no database and no network.
 *
 * This is the floor the whole feature rests on: whatever else is unavailable -
 * Postgres, pgvector, the API key, the analysis rows - search still behaves at
 * least as well as the filter it replaced.
 */
export function matchNamesLocally(query: string, sounds: SearchableSound[]): string[] {
  const normalizedQuery = normalizeForSearch(query);
  if (!normalizedQuery) return sounds.map((sound) => sound.name);

  return sounds
    .map((sound) => {
      const haystack = normalizeForSearch(`${sound.name} ${sound.displayName ?? ''}`);
      const index = haystack.indexOf(normalizedQuery);
      const nameIndex = normalizeForSearch(sound.name).indexOf(normalizedQuery);
      return { name: sound.name, index, nameIndex };
    })
    .filter((entry) => entry.index !== -1)
    .sort((a, b) => {
      const aPrefix = a.nameIndex === 0 ? 0 : 1;
      const bPrefix = b.nameIndex === 0 ? 0 : 1;
      if (aPrefix !== bPrefix) return aPrefix - bPrefix;
      return a.index - b.index;
    })
    .map((entry) => entry.name);
}

function pickMatchSource(sources: MatchSource[], analysis: SoundAnalysis | undefined): MatchSource {
  if (sources.includes('name')) return 'name';
  if (sources.includes('semantic')) return 'semantic';
  if (analysis?.transcript) return 'transcript';
  return 'caption';
}

function pickSnippet(matchedOn: MatchSource, analysis: SoundAnalysis | undefined): string | null {
  if (!analysis) return null;
  if (matchedOn === 'name') return null;
  if (matchedOn === 'transcript') return analysis.transcript;
  return analysis.caption || null;
}

export async function searchSounds(options: SearchOptions): Promise<SoundSearchResult[]> {
  const { query, sounds } = options;
  const limit = options.limit ?? DEFAULT_LIMIT;
  const allowSemantic = options.allowSemantic ?? true;

  const known = new Set(sounds.map((sound) => sound.name));
  const lists: RankedList[] = [];

  const localNames = matchNamesLocally(query, sounds);
  lists.push({ source: 'name', names: localNames });

  let storedNames: string[] = [];
  try {
    storedNames = (await lexicalSearch(query, limit)).filter((name) => known.has(name));
  } catch (error) {
    const err = error as Error;
    log.debug(`Lexical search unavailable: ${err.message}`);
  }
  if (storedNames.length > 0) lists.push({ source: 'caption', names: storedNames });

  const lexicalHitCount = new Set([...localNames, ...storedNames]).size;

  // A name match already answers the query - don't spend an API call
  // rescuing something that isn't lost.
  if (allowSemantic && localNames.length === 0 && shouldUseSemantic(query, lexicalHitCount)) {
    try {
      const embedding = await embedText(query);
      if (embedding) {
        const semanticNames = (await vectorSearch(embedding, limit)).filter((name) =>
          known.has(name)
        );
        if (semanticNames.length > 0) lists.push({ source: 'semantic', names: semanticNames });
      }
    } catch (error) {
      const err = error as Error;
      log.debug(`Semantic search unavailable: ${err.message}`);
    }
  }

  const fused = pinExactPrefix(fuseRankings(lists), query).slice(0, limit);

  let analyses = new Map<string, SoundAnalysis>();
  try {
    analyses = await getAnalysisFor(fused.map((hit) => hit.name));
  } catch (error) {
    const err = error as Error;
    log.debug(`Analysis lookup unavailable: ${err.message}`);
  }

  return fused.map((hit) => {
    const analysis = analyses.get(hit.name);
    const matchedOn = pickMatchSource(hit.sources, analysis);
    return {
      name: hit.name,
      score: hit.score,
      matchedOn,
      snippet: pickSnippet(matchedOn, analysis),
    };
  });
}
