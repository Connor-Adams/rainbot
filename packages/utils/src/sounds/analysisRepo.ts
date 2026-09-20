import { query } from '../database';
import { createLogger } from '../logger';
import { normalizeForSearch } from './searchText';
import type { SoundAnalysis, SoundKind } from './types';

const log = createLogger('SOUND-ANALYSIS-REPO');

const EMBEDDING_DIMENSIONS = 1536;

/**
 * Whether this database can do vector similarity in SQL.
 *
 * null means "not yet checked". pgvector is not guaranteed to be installed,
 * and the feature must work without it, so every vector path consults this
 * and falls back to cosine in JS. At soundboard scale that fallback is
 * perfectly serviceable - it is a fallback for capability, not for size.
 */
let vectorAvailable: boolean | null = null;

/**
 * The detection currently in flight, so concurrent callers share one probe
 * rather than each issuing their own CREATE EXTENSION.
 */
let detectionInFlight: Promise<boolean> | null = null;

export function isVectorAvailable(): boolean {
  return vectorAvailable === true;
}

export function resetVectorSupportCache(): void {
  vectorAvailable = null;
  detectionInFlight = null;
}

/**
 * Attempts to enable pgvector, and remembers whether it worked.
 *
 * Every path that needs the answer calls this rather than reading the cached
 * flag directly: the flag resets on each process start, and if only the sweep
 * ever detected, a redeployed process would write no vector column and would
 * rank every query in JS until someone happened to run a sweep. Detection is
 * still one probe per process - the result is cached, and concurrent callers
 * share the in-flight promise.
 */
export async function detectVectorSupport(): Promise<boolean> {
  if (vectorAvailable !== null) return vectorAvailable;
  if (detectionInFlight) return detectionInFlight;

  detectionInFlight = probeVectorSupport().finally(() => {
    detectionInFlight = null;
  });
  return detectionInFlight;
}

async function probeVectorSupport(): Promise<boolean> {
  try {
    return await runVectorProbe();
  } catch (error) {
    // query() answers null rather than throwing when there is no database, so
    // reaching here means a real SQL failure. Cache the negative so a broken
    // extension does not re-probe on every search.
    const err = error as Error;
    log.warn(`pgvector detection failed - semantic search will rank in JS: ${err.message}`);
    vectorAvailable = false;
    return false;
  }
}

async function runVectorProbe(): Promise<boolean> {
  const created = await query('CREATE EXTENSION IF NOT EXISTS vector');
  if (!created) {
    log.info('pgvector unavailable - semantic search will rank in JS');
    vectorAvailable = false;
    return false;
  }

  const altered = await query(
    `ALTER TABLE sound_analysis ADD COLUMN IF NOT EXISTS embedding vector(${EMBEDDING_DIMENSIONS})`
  );
  vectorAvailable = altered !== null;
  if (vectorAvailable) {
    log.info('pgvector enabled for sound search');

    // pgvector may have been installed after rows already existed with only
    // embedding_json populated. Backfill embedding from embedding_json so
    // vectorSearch's SQL branch (WHERE embedding IS NOT NULL) does not
    // silently skip pre-existing rows.
    const backfilled = await query(
      `UPDATE sound_analysis
          SET embedding = embedding_json::text::vector
        WHERE embedding IS NULL
          AND embedding_json IS NOT NULL`
    );
    if (backfilled) {
      log.info('backfilled pgvector embeddings from embedding_json');
    } else {
      // query() answers null for a missing database *and* for a rejected
      // statement, so this covers a genuine SQL or cast error too - naming
      // only the first would send someone looking in the wrong place.
      log.warn(
        'pgvector embedding backfill did not run - no database, or the UPDATE was rejected (for example a cast error on stored embedding_json)'
      );
    }
  }
  return vectorAvailable;
}

function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(',')}]`;
}

export async function upsertAnalysis(
  analysis: SoundAnalysis,
  embedding: number[] | null
): Promise<void> {
  const embeddingJson = embedding ? JSON.stringify(embedding) : null;

  await query(
    `INSERT INTO sound_analysis
       (sound_name, kind, transcript, caption, tags, search_doc, search_norm,
        embedding_json, source_size, model, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
     ON CONFLICT (sound_name) DO UPDATE SET
       kind = EXCLUDED.kind,
       transcript = EXCLUDED.transcript,
       caption = EXCLUDED.caption,
       tags = EXCLUDED.tags,
       search_doc = EXCLUDED.search_doc,
       search_norm = EXCLUDED.search_norm,
       embedding_json = EXCLUDED.embedding_json,
       source_size = EXCLUDED.source_size,
       model = EXCLUDED.model,
       updated_at = NOW()`,
    [
      analysis.soundName,
      analysis.kind,
      analysis.transcript,
      analysis.caption,
      analysis.tags,
      analysis.searchDoc,
      normalizeForSearch(analysis.searchDoc),
      embeddingJson,
      analysis.sourceSize,
      analysis.model,
    ]
  );

  if (embedding && (await detectVectorSupport())) {
    await query(`UPDATE sound_analysis SET embedding = $2::vector WHERE sound_name = $1`, [
      analysis.soundName,
      toVectorLiteral(embedding),
    ]);
  }
}

export async function deleteAnalysis(soundName: string): Promise<void> {
  await query(`DELETE FROM sound_analysis WHERE sound_name = $1`, [soundName]);
}

/** Recorded source sizes, used to skip clips that have not changed. */
export async function getAnalysisSizes(): Promise<Map<string, number | null>> {
  const result = await query(`SELECT sound_name, source_size FROM sound_analysis`);
  const sizes = new Map<string, number | null>();
  if (!result) return sizes;

  for (const row of result.rows as Array<{ sound_name: string; source_size: string | null }>) {
    sizes.set(row.sound_name, row.source_size === null ? null : Number(row.source_size));
  }
  return sizes;
}

export async function getAnalysisFor(names: string[]): Promise<Map<string, SoundAnalysis>> {
  const found = new Map<string, SoundAnalysis>();
  if (names.length === 0) return found;

  const result = await query(
    `SELECT sound_name, kind, transcript, caption, tags, search_doc, source_size, model
       FROM sound_analysis WHERE sound_name = ANY($1)`,
    [names]
  );
  if (!result) return found;

  for (const row of result.rows as Array<{
    sound_name: string;
    kind: SoundKind;
    transcript: string | null;
    caption: string;
    tags: string[];
    search_doc: string;
    source_size: string | null;
    model: string;
  }>) {
    found.set(row.sound_name, {
      soundName: row.sound_name,
      kind: row.kind,
      transcript: row.transcript,
      caption: row.caption,
      tags: row.tags ?? [],
      searchDoc: row.search_doc,
      sourceSize: row.source_size === null ? null : Number(row.source_size),
      model: row.model,
    });
  }
  return found;
}

/**
 * Ranks stored analyses lexically.
 *
 * Tiers run from an exact normalized prefix down to a word match, so a
 * near-miss on the filename always beats a loose hit inside a caption.
 */
export async function lexicalSearch(searchQuery: string, limit: number): Promise<string[]> {
  const normalized = normalizeForSearch(searchQuery);
  if (!normalized) return [];

  const result = await query(
    `SELECT sound_name,
            CASE
              WHEN search_norm LIKE $2 || '%' THEN 0
              WHEN search_norm LIKE '%' || $2 || '%' THEN 1
              ELSE 2
            END AS tier
       FROM sound_analysis
      WHERE search_norm LIKE '%' || $2 || '%'
         OR search_tsv @@ websearch_to_tsquery('english', $1)
      ORDER BY tier ASC, length(search_norm) ASC
      LIMIT $3`,
    [searchQuery, normalized, limit]
  );
  if (!result) return [];

  return (result.rows as Array<{ sound_name: string }>).map((row) => row.sound_name);
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let magA = 0;
  let magB = 0;
  const length = Math.min(a.length, b.length);

  for (let i = 0; i < length; i += 1) {
    dot += (a[i] ?? 0) * (b[i] ?? 0);
    magA += (a[i] ?? 0) ** 2;
    magB += (b[i] ?? 0) ** 2;
  }

  const denominator = Math.sqrt(magA) * Math.sqrt(magB);
  return denominator === 0 ? 0 : dot / denominator;
}

/** Ranks stored analyses by embedding similarity, in SQL or in JS. */
export async function vectorSearch(embedding: number[], limit: number): Promise<string[]> {
  if (await detectVectorSupport()) {
    const result = await query(
      `SELECT sound_name
         FROM sound_analysis
        WHERE embedding IS NOT NULL
        ORDER BY embedding <=> $1::vector
        LIMIT $2`,
      [toVectorLiteral(embedding), limit]
    );
    if (result) return (result.rows as Array<{ sound_name: string }>).map((row) => row.sound_name);
  }

  const result = await query(
    `SELECT sound_name, embedding_json FROM sound_analysis WHERE embedding_json IS NOT NULL`
  );
  if (!result) return [];

  return (result.rows as Array<{ sound_name: string; embedding_json: string | number[] }>)
    .map((row) => {
      const stored =
        typeof row.embedding_json === 'string'
          ? (JSON.parse(row.embedding_json) as number[])
          : row.embedding_json;
      return { name: row.sound_name, score: cosineSimilarity(embedding, stored) };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => entry.name);
}
