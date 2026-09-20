import { loadConfig } from '../config';
import { createLogger } from '../logger';

const log = createLogger('SOUND-EMBEDDINGS');

const MIN_SEMANTIC_QUERY_LENGTH = 4;
const MAX_LEXICAL_HITS_BEFORE_SEMANTIC = 5;
const CACHE_LIMIT = 200;

/** Query text to embedding, most-recently-used last. */
const cache = new Map<string, number[]>();

export function clearEmbeddingCache(): void {
  cache.clear();
}

/**
 * Whether a semantic pass is worth its API call.
 *
 * Discord autocomplete fires on every keystroke against a 3 second budget, so
 * embedding every one is both slow and wasteful. A short query is usually a
 * prefix mid-typing, and a query lexical matching already answered well does
 * not need rescuing - so the call is spent only where literal matching has
 * visibly failed.
 */
export function shouldUseSemantic(query: string, lexicalHitCount: number): boolean {
  if (query.trim().length < MIN_SEMANTIC_QUERY_LENGTH) return false;
  return lexicalHitCount < MAX_LEXICAL_HITS_BEFORE_SEMANTIC;
}

export async function embedText(text: string): Promise<number[] | null> {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const cached = cache.get(trimmed);
  if (cached) {
    cache.delete(trimmed);
    cache.set(trimmed, cached);
    return cached;
  }

  const config = loadConfig();
  if (!config.openaiApiKey) return null;

  // openai is an optionalDependency; require it lazily so a missing package
  // degrades quietly instead of failing type-check or install.
  let OpenAI: any;
  try {
     
    ({ OpenAI } = require('openai'));
  } catch {
    log.warn('openai package not installed - skipping embeddings');
    return null;
  }

  try {
    const client = new OpenAI({ apiKey: config.openaiApiKey });
    const response = await client.embeddings.create({
      model: config.soundEmbeddingModel,
      input: trimmed,
    });

    const embedding = response.data?.[0]?.embedding;
    if (!embedding) return null;

    cache.set(trimmed, embedding);
    if (cache.size > CACHE_LIMIT) {
      const oldest = cache.keys().next().value;
      if (oldest !== undefined) cache.delete(oldest);
    }

    return embedding;
  } catch (error) {
    const err = error as Error;
    log.warn(`Embedding failed: ${err.message}`);
    return null;
  }
}
