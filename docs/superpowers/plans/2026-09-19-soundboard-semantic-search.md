# Soundboard Semantic Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a soundboard clip findable by what is said in it, by what it sounds like, or by a loosely-remembered filename, on both the dashboard and the Discord `/play` autocomplete.

**Architecture:** Each clip is classified once by an audio-input LLM into `speech | sound | mixed`, which decides how it gets read: effects get a caption plus keyword tags, speech additionally gets a verbatim Whisper transcript. The resulting text is stored in a new `sound_analysis` table alongside a text embedding. Search fuses a normalized lexical pass with vector similarity using Reciprocal Rank Fusion, and degrades cleanly — to lexical-only without pgvector, and to today's filename matching with no database at all.

**Tech Stack:** TypeScript, Node ≥22.12, Yarn 4 workspaces + Turbo, PostgreSQL via `pg` (raw SQL, not drizzle), pgvector (optional), OpenAI SDK (an `optionalDependency` of `@rainbot/utils`), Express, React + TanStack Query, Jest + ts-jest.

## Global Constraints

- **Never import by bare path.** Use `@rainbot/*` package names or path aliases. Enforced by `no-restricted-imports` in `eslint.config.js`.
- **apps → packages only.** Packages must not import apps.
- `openai` is an **optionalDependency** of `@rainbot/utils`. Import it with a lazy `require` inside a try/catch, exactly as `packages/utils/src/voice/speechRecognition.ts:118` does. A missing package must degrade, never throw at module load.
- The database is **optional** in this repo. `query()` returns `null` when no pool exists. Every DB path must tolerate `null` and fall back, never throw.
- **No network calls in tests.** Stub every OpenAI call. A test run must cost nothing.
- Tests are colocated in `__tests__/` next to the code.
- Logging is `const log = createLogger('MODULE')` from `@rainbot/utils`.
- Tests import `@rainbot/*` from `dist/`, so run `yarn build:ts` before invoking a single workspace's tests directly.
- `yarn validate` (type-check && format:check && test) is the definition of done.
- Run all commands from the repo root.

---

### Task 1: Search text normalization

Pure string functions, no I/O. This task alone fixes `air horn` → `airhorn.ogg`.

**Files:**

- Create: `packages/utils/src/sounds/searchText.ts`
- Test: `packages/utils/src/sounds/__tests__/searchText.test.ts`

**Interfaces:**

- Consumes: nothing.
- Produces:
  - `normalizeForSearch(input: string): string`
  - `humanizeFilename(name: string): string`
  - `buildSearchDoc(parts: SearchDocParts): string`
  - `interface SearchDocParts { name: string; displayName?: string | null; transcript?: string | null; caption?: string | null; tags?: string[] }`

- [ ] **Step 1: Write the failing test**

Create `packages/utils/src/sounds/__tests__/searchText.test.ts`:

```ts
import { normalizeForSearch, humanizeFilename, buildSearchDoc } from '../searchText';

describe('normalizeForSearch', () => {
  it('strips every non-alphanumeric character and lowercases', () => {
    expect(normalizeForSearch('Air-Horn!.ogg')).toBe('airhornogg');
    expect(normalizeForSearch('  AIR   HORN  ')).toBe('airhorn');
  });

  it('makes a spaced query equal to a squashed filename', () => {
    expect(normalizeForSearch('air horn')).toBe(normalizeForSearch('airhorn'));
  });

  it('returns an empty string for input with no alphanumerics', () => {
    expect(normalizeForSearch('---')).toBe('');
  });
});

describe('humanizeFilename', () => {
  it('drops the extension and splits separators into spaces', () => {
    expect(humanizeFilename('sad_trombone-2.mp3')).toBe('sad trombone 2');
  });

  it('splits camelCase into words', () => {
    expect(humanizeFilename('airHornBlast.ogg')).toBe('air Horn Blast');
  });

  it('leaves an already-plain name alone', () => {
    expect(humanizeFilename('bruh.ogg')).toBe('bruh');
  });
});

describe('buildSearchDoc', () => {
  it('joins every populated part', () => {
    const doc = buildSearchDoc({
      name: 'airhorn.ogg',
      displayName: 'Air Horn',
      transcript: null,
      caption: 'a loud brassy air horn blast',
      tags: ['air horn', 'blast'],
    });
    expect(doc).toContain('airhorn');
    expect(doc).toContain('Air Horn');
    expect(doc).toContain('brassy');
    expect(doc).toContain('blast');
  });

  it('omits null and empty parts without leaving double spaces', () => {
    const doc = buildSearchDoc({ name: 'bruh.ogg', caption: 'a man says bruh' });
    expect(doc).not.toMatch(/\s{2,}/);
    expect(doc.trim()).toBe(doc);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn workspace @rainbot/utils test src/sounds/__tests__/searchText.test.ts`
Expected: FAIL — `Cannot find module '../searchText'`

- [ ] **Step 3: Write the implementation**

Create `packages/utils/src/sounds/searchText.ts`:

```ts
/**
 * Text shaping for soundboard search.
 *
 * `airhorn.ogg` does not match the query "air horn" under a plain substring
 * test - the space breaks it. Normalizing both sides down to bare
 * alphanumerics makes the two identical, which fixes the common case with no
 * model involved at all.
 */

export interface SearchDocParts {
  name: string;
  displayName?: string | null;
  transcript?: string | null;
  caption?: string | null;
  tags?: string[];
}

/** Reduces text to lowercase alphanumerics, so "Air-Horn" === "air horn". */
export function normalizeForSearch(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Turns a filename into words a person (or a tokenizer) would recognize. */
export function humanizeFilename(name: string): string {
  const withoutExt = name.replace(/\.[^/.]+$/, '');
  return withoutExt
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_\-.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Composes everything known about a sound into one indexable document. */
export function buildSearchDoc(parts: SearchDocParts): string {
  const pieces = [
    parts.name,
    humanizeFilename(parts.name),
    parts.displayName ?? '',
    parts.transcript ?? '',
    parts.caption ?? '',
    (parts.tags ?? []).join(' '),
  ];

  return pieces
    .map((piece) => piece.trim())
    .filter((piece) => piece.length > 0)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `yarn workspace @rainbot/utils test src/sounds/__tests__/searchText.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/utils/src/sounds/searchText.ts packages/utils/src/sounds/__tests__/searchText.test.ts
git commit -m "feat(sounds): normalize search text so 'air horn' matches airhorn.ogg"
```

---

### Task 2: Reciprocal Rank Fusion

Pure ranking, no I/O. Lexical scores and cosine distances are not on comparable scales, so they are fused by rank rather than blended by value.

**Files:**

- Create: `packages/utils/src/sounds/rankFusion.ts`
- Test: `packages/utils/src/sounds/__tests__/rankFusion.test.ts`

**Interfaces:**

- Consumes: `normalizeForSearch` from Task 1.
- Produces:
  - `type MatchSource = 'name' | 'transcript' | 'caption' | 'semantic'`
  - `interface RankedList { source: MatchSource; names: string[] }`
  - `interface FusedHit { name: string; score: number; sources: MatchSource[] }`
  - `fuseRankings(lists: RankedList[], k?: number): FusedHit[]`
  - `pinExactPrefix(hits: FusedHit[], query: string): FusedHit[]`

- [ ] **Step 1: Write the failing test**

Create `packages/utils/src/sounds/__tests__/rankFusion.test.ts`:

```ts
import { fuseRankings, pinExactPrefix } from '../rankFusion';

describe('fuseRankings', () => {
  it('ranks a name appearing in both lists above one appearing in either alone', () => {
    const fused = fuseRankings([
      { source: 'name', names: ['a.ogg', 'b.ogg'] },
      { source: 'semantic', names: ['b.ogg', 'c.ogg'] },
    ]);
    expect(fused[0]?.name).toBe('b.ogg');
  });

  it('records every source that contributed a hit', () => {
    const fused = fuseRankings([
      { source: 'name', names: ['b.ogg'] },
      { source: 'semantic', names: ['b.ogg'] },
    ]);
    expect(fused[0]?.sources).toEqual(['name', 'semantic']);
  });

  it('preserves within-list order when only one list contributes', () => {
    const fused = fuseRankings([{ source: 'name', names: ['a.ogg', 'b.ogg', 'c.ogg'] }]);
    expect(fused.map((hit) => hit.name)).toEqual(['a.ogg', 'b.ogg', 'c.ogg']);
  });

  it('ignores empty lists', () => {
    const fused = fuseRankings([
      { source: 'name', names: [] },
      { source: 'semantic', names: ['x.ogg'] },
    ]);
    expect(fused.map((hit) => hit.name)).toEqual(['x.ogg']);
  });

  it('deduplicates a name repeated within one list', () => {
    const fused = fuseRankings([{ source: 'name', names: ['a.ogg', 'a.ogg'] }]);
    expect(fused).toHaveLength(1);
  });
});

describe('pinExactPrefix', () => {
  it('lifts a normalized prefix match to the front', () => {
    const hits = [
      { name: 'loud.ogg', score: 0.9, sources: ['semantic' as const] },
      { name: 'airhorn.ogg', score: 0.1, sources: ['name' as const] },
    ];
    expect(pinExactPrefix(hits, 'air horn')[0]?.name).toBe('airhorn.ogg');
  });

  it('leaves order alone when nothing matches the prefix', () => {
    const hits = [
      { name: 'loud.ogg', score: 0.9, sources: ['semantic' as const] },
      { name: 'quiet.ogg', score: 0.1, sources: ['name' as const] },
    ];
    expect(pinExactPrefix(hits, 'trombone').map((hit) => hit.name)).toEqual([
      'loud.ogg',
      'quiet.ogg',
    ]);
  });

  it('returns hits unchanged for an empty query', () => {
    const hits = [{ name: 'a.ogg', score: 1, sources: ['name' as const] }];
    expect(pinExactPrefix(hits, '')).toEqual(hits);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn workspace @rainbot/utils test src/sounds/__tests__/rankFusion.test.ts`
Expected: FAIL — `Cannot find module '../rankFusion'`

- [ ] **Step 3: Write the implementation**

Create `packages/utils/src/sounds/rankFusion.ts`:

```ts
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `yarn workspace @rainbot/utils test src/sounds/__tests__/rankFusion.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/utils/src/sounds/rankFusion.ts packages/utils/src/sounds/__tests__/rankFusion.test.ts
git commit -m "feat(sounds): fuse lexical and vector rankings with RRF"
```

---

### Task 3: Shared types and configuration

**Files:**

- Create: `packages/utils/src/sounds/types.ts`
- Modify: `packages/utils/src/config.ts` (the `AppConfig` interface ending at line 53, and the returned object ending at line 176)
- Modify: `.env.example`
- Test: `packages/utils/src/sounds/__tests__/config.test.ts`

**Interfaces:**

- Consumes: `MatchSource` from Task 2.
- Produces:
  - `type SoundKind = 'speech' | 'sound' | 'mixed'`
  - `interface SoundDescription { kind: SoundKind; caption: string; tags: string[] }`
  - `interface SoundAnalysis { soundName: string; kind: SoundKind; transcript: string | null; caption: string; tags: string[]; searchDoc: string; sourceSize: number | null; model: string }`
  - `interface SoundSearchResult { name: string; score: number; matchedOn: MatchSource; snippet: string | null }`
  - Config fields: `openaiApiKey`, `soundCaptionModel`, `soundEmbeddingModel`, `soundAnalysisEnabled`

- [ ] **Step 1: Write the failing test**

Create `packages/utils/src/sounds/__tests__/config.test.ts`:

```ts
describe('sound analysis config', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.resetModules();
  });

  it('defaults the caption and embedding models', () => {
    delete process.env['SOUND_CAPTION_MODEL'];
    delete process.env['SOUND_EMBEDDING_MODEL'];
    jest.resetModules();
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { loadConfig } = require('../../config');
    const config = loadConfig(true);
    expect(config.soundCaptionModel).toBe('gpt-4o-audio-preview');
    expect(config.soundEmbeddingModel).toBe('text-embedding-3-small');
  });

  it('falls back from OPENAI_API_KEY to STT_API_KEY', () => {
    delete process.env['OPENAI_API_KEY'];
    process.env['STT_API_KEY'] = 'from-stt';
    jest.resetModules();
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { loadConfig } = require('../../config');
    expect(loadConfig(true).openaiApiKey).toBe('from-stt');
  });

  it('is disabled when SOUND_ANALYSIS_ENABLED is false', () => {
    process.env['SOUND_ANALYSIS_ENABLED'] = 'false';
    jest.resetModules();
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { loadConfig } = require('../../config');
    expect(loadConfig(true).soundAnalysisEnabled).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn workspace @rainbot/utils test src/sounds/__tests__/config.test.ts`
Expected: FAIL — `soundCaptionModel` is `undefined`.

Note: `loadConfig` caches its result. Check its current signature; if it does not already accept a reload argument, add `export function loadConfig(forceReload = false)` returning the cache unless `forceReload` is true. Keep the existing default behaviour byte-for-byte identical for every current caller.

- [ ] **Step 3: Write the implementation**

Add to the `AppConfig` interface in `packages/utils/src/config.ts`, immediately before its closing brace:

```ts
// Sound analysis configuration (soundboard transcription + search)
openaiApiKey: string | undefined;
soundCaptionModel: string;
soundEmbeddingModel: string;
soundAnalysisEnabled: boolean;
```

Add to the returned config object, immediately before its closing brace:

```ts
    // Sound analysis configuration (soundboard transcription + search)
    openaiApiKey: process.env['OPENAI_API_KEY'] || process.env['STT_API_KEY'],
    soundCaptionModel: process.env['SOUND_CAPTION_MODEL'] || 'gpt-4o-audio-preview',
    soundEmbeddingModel: process.env['SOUND_EMBEDDING_MODEL'] || 'text-embedding-3-small',
    soundAnalysisEnabled: process.env['SOUND_ANALYSIS_ENABLED'] !== 'false',
```

Create `packages/utils/src/sounds/types.ts`:

```ts
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
```

Append to `.env.example`, after the STT block:

```bash
# Soundboard search - analysis of uploaded clips (classification, captions,
# transcripts, embeddings). Uses OPENAI_API_KEY, falling back to STT_API_KEY.
# Set SOUND_ANALYSIS_ENABLED=false to turn the whole feature off; search then
# degrades to filename matching.
# SOUND_ANALYSIS_ENABLED=true
# SOUND_CAPTION_MODEL=gpt-4o-audio-preview
# SOUND_EMBEDDING_MODEL=text-embedding-3-small
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `yarn workspace @rainbot/utils test src/sounds/__tests__/config.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/utils/src/sounds/types.ts packages/utils/src/sounds/__tests__/config.test.ts packages/utils/src/config.ts .env.example
git commit -m "feat(sounds): add sound analysis config and shared types"
```

---

### Task 4: The `sound_analysis` table and its repository

**Files:**

- Create: `packages/utils/src/sounds/analysisRepo.ts`
- Modify: `packages/utils/src/database.ts` (add a table inside `initializeSchema` after the `sound_customizations` block at line 174; add indexes in the index section near line 600)
- Test: `packages/utils/src/sounds/__tests__/analysisRepo.test.ts`

**Interfaces:**

- Consumes: `query` from `../database`; `normalizeForSearch` from Task 1; `SoundAnalysis`, `SoundKind` from Task 3.
- Produces:
  - `detectVectorSupport(): Promise<boolean>`
  - `isVectorAvailable(): boolean`
  - `resetVectorSupportCache(): void`
  - `upsertAnalysis(analysis: SoundAnalysis, embedding: number[] | null): Promise<void>`
  - `deleteAnalysis(soundName: string): Promise<void>`
  - `getAnalysisSizes(): Promise<Map<string, number | null>>`
  - `getAnalysisFor(names: string[]): Promise<Map<string, SoundAnalysis>>`
  - `lexicalSearch(searchQuery: string, limit: number): Promise<string[]>`
  - `vectorSearch(embedding: number[], limit: number): Promise<string[]>`

- [ ] **Step 1: Write the failing test**

Create `packages/utils/src/sounds/__tests__/analysisRepo.test.ts`:

```ts
const mockQuery = jest.fn();

jest.mock('../../database', () => ({
  query: (...args: unknown[]) => mockQuery(...args),
}));

import {
  detectVectorSupport,
  isVectorAvailable,
  resetVectorSupportCache,
  upsertAnalysis,
  lexicalSearch,
  vectorSearch,
  getAnalysisSizes,
} from '../analysisRepo';
import type { SoundAnalysis } from '../types';

const analysis: SoundAnalysis = {
  soundName: 'airhorn.ogg',
  kind: 'sound',
  transcript: null,
  caption: 'a loud brassy air horn blast',
  tags: ['air horn', 'blast'],
  searchDoc: 'airhorn.ogg airhorn a loud brassy air horn blast air horn blast',
  sourceSize: 1234,
  model: 'gpt-4o-audio-preview',
};

beforeEach(() => {
  mockQuery.mockReset();
  resetVectorSupportCache();
});

describe('detectVectorSupport', () => {
  it('reports true when the extension is created', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    await expect(detectVectorSupport()).resolves.toBe(true);
    expect(isVectorAvailable()).toBe(true);
  });

  it('reports false when the extension cannot be created', async () => {
    mockQuery.mockResolvedValue(null);
    await expect(detectVectorSupport()).resolves.toBe(false);
    expect(isVectorAvailable()).toBe(false);
  });
});

describe('upsertAnalysis', () => {
  it('always writes the JSON embedding', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    await upsertAnalysis(analysis, [0.1, 0.2]);

    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('INSERT INTO sound_analysis');
    expect(params).toContain('airhorn.ogg');
    expect(params).toContainEqual(JSON.stringify([0.1, 0.2]));
  });

  it('writes the pgvector column only once support is detected', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    await upsertAnalysis(analysis, [0.1, 0.2]);
    expect(mockQuery.mock.calls.some(([sql]) => String(sql).includes('::vector'))).toBe(false);

    await detectVectorSupport();
    mockQuery.mockClear();
    mockQuery.mockResolvedValue({ rows: [] });
    await upsertAnalysis(analysis, [0.1, 0.2]);
    expect(mockQuery.mock.calls.some(([sql]) => String(sql).includes('::vector'))).toBe(true);
  });

  it('tolerates a null embedding', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    await expect(upsertAnalysis(analysis, null)).resolves.toBeUndefined();
  });
});

describe('lexicalSearch', () => {
  it('returns names in the order the database ranked them', async () => {
    mockQuery.mockResolvedValue({ rows: [{ sound_name: 'a.ogg' }, { sound_name: 'b.ogg' }] });
    await expect(lexicalSearch('air horn', 25)).resolves.toEqual(['a.ogg', 'b.ogg']);
  });

  it('returns an empty list when the database is unavailable', async () => {
    mockQuery.mockResolvedValue(null);
    await expect(lexicalSearch('air horn', 25)).resolves.toEqual([]);
  });

  it('passes both the raw and the normalized query', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    await lexicalSearch('Air Horn', 25);
    const [, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(params).toContain('Air Horn');
    expect(params).toContain('airhorn');
  });
});

describe('vectorSearch', () => {
  it('returns an empty list when the database is unavailable', async () => {
    mockQuery.mockResolvedValue(null);
    await expect(vectorSearch([0.1], 10)).resolves.toEqual([]);
  });

  it('ranks by cosine in JS when pgvector is absent', async () => {
    mockQuery.mockResolvedValue({
      rows: [
        { sound_name: 'far.ogg', embedding_json: JSON.stringify([0, 1]) },
        { sound_name: 'near.ogg', embedding_json: JSON.stringify([1, 0]) },
      ],
    });
    await expect(vectorSearch([1, 0], 10)).resolves.toEqual(['near.ogg', 'far.ogg']);
  });
});

describe('getAnalysisSizes', () => {
  it('maps sound names to their recorded source size', async () => {
    mockQuery.mockResolvedValue({ rows: [{ sound_name: 'a.ogg', source_size: '99' }] });
    const sizes = await getAnalysisSizes();
    expect(sizes.get('a.ogg')).toBe(99);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn workspace @rainbot/utils test src/sounds/__tests__/analysisRepo.test.ts`
Expected: FAIL — `Cannot find module '../analysisRepo'`

- [ ] **Step 3: Write the implementation**

Add to `initializeSchema` in `packages/utils/src/database.ts`, directly after the `sound_customizations` block:

```ts
await pool.query(`
            CREATE TABLE IF NOT EXISTS sound_analysis (
                sound_name VARCHAR(255) PRIMARY KEY,
                kind VARCHAR(10) NOT NULL CHECK (kind IN ('speech', 'sound', 'mixed')),
                transcript TEXT,
                caption TEXT NOT NULL DEFAULT '',
                tags TEXT[] NOT NULL DEFAULT '{}',
                search_doc TEXT NOT NULL DEFAULT '',
                search_norm TEXT NOT NULL DEFAULT '',
                search_tsv tsvector GENERATED ALWAYS AS (to_tsvector('english', search_doc)) STORED,
                embedding_json JSONB,
                source_size BIGINT,
                model VARCHAR(100) NOT NULL DEFAULT '',
                updated_at TIMESTAMP NOT NULL DEFAULT NOW()
            )
        `);
```

Add to the index section of the same function:

```ts
await pool.query(
  `CREATE INDEX IF NOT EXISTS idx_sound_analysis_tsv ON sound_analysis USING GIN(search_tsv)`
);
await pool.query(`CREATE INDEX IF NOT EXISTS idx_sound_analysis_kind ON sound_analysis(kind)`);
```

Create `packages/utils/src/sounds/analysisRepo.ts`:

```ts
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

export function isVectorAvailable(): boolean {
  return vectorAvailable === true;
}

export function resetVectorSupportCache(): void {
  vectorAvailable = null;
}

/** Attempts to enable pgvector, and remembers whether it worked. */
export async function detectVectorSupport(): Promise<boolean> {
  if (vectorAvailable !== null) return vectorAvailable;

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
  if (vectorAvailable) log.info('pgvector enabled for sound search');
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

  if (embedding && isVectorAvailable()) {
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
  if (isVectorAvailable()) {
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `yarn workspace @rainbot/utils test src/sounds/__tests__/analysisRepo.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/utils/src/sounds/analysisRepo.ts packages/utils/src/sounds/__tests__/analysisRepo.test.ts packages/utils/src/database.ts
git commit -m "feat(sounds): add sound_analysis table with a pgvector-optional repository"
```

---

### Task 5: Stage 1 — classify and describe

One audio-input LLM call per clip. It decides what the clip _is_ before anything tries to read it.

**Files:**

- Create: `packages/utils/src/sounds/audioAnalyzer.ts`
- Test: `packages/utils/src/sounds/__tests__/audioAnalyzer.test.ts`

**Interfaces:**

- Consumes: `loadConfig` from `../config`; `SoundDescription`, `SoundKind` from Task 3.
- Produces:
  - `describeAudio(buffer: Buffer, filename: string): Promise<SoundDescription | null>`
  - `parseDescription(raw: string): SoundDescription | null`
  - `DESCRIBE_PROMPT: string`

Returning `null` means "could not analyze" — no key, no package, or an unparseable reply. Callers must treat that as "leave this clip alone", never as an empty description.

- [ ] **Step 1: Write the failing test**

Create `packages/utils/src/sounds/__tests__/audioAnalyzer.test.ts`:

````ts
import { parseDescription } from '../audioAnalyzer';

describe('parseDescription', () => {
  it('parses a well-formed reply', () => {
    const parsed = parseDescription(
      JSON.stringify({
        kind: 'sound',
        caption: 'a loud brassy air horn blast',
        tags: ['air horn', 'blast'],
      })
    );
    expect(parsed).toEqual({
      kind: 'sound',
      caption: 'a loud brassy air horn blast',
      tags: ['air horn', 'blast'],
    });
  });

  it('unwraps a fenced code block', () => {
    const parsed = parseDescription(
      '```json\n{"kind":"speech","caption":"a man yells","tags":[]}\n```'
    );
    expect(parsed?.kind).toBe('speech');
  });

  it('rejects an unknown kind', () => {
    expect(parseDescription(JSON.stringify({ kind: 'music', caption: 'x', tags: [] }))).toBeNull();
  });

  it('returns null for unparseable text', () => {
    expect(parseDescription('I could not process that audio.')).toBeNull();
  });

  it('coerces a missing tags field to an empty array', () => {
    expect(parseDescription(JSON.stringify({ kind: 'sound', caption: 'a thud' }))?.tags).toEqual(
      []
    );
  });

  it('drops non-string tags and trims the rest', () => {
    const parsed = parseDescription(
      JSON.stringify({ kind: 'sound', caption: 'a thud', tags: ['  bass  ', 42, null] })
    );
    expect(parsed?.tags).toEqual(['bass']);
  });

  it('caps runaway tag lists at eight', () => {
    const tags = Array.from({ length: 20 }, (_, i) => `tag${i}`);
    expect(
      parseDescription(JSON.stringify({ kind: 'sound', caption: 'x', tags }))?.tags
    ).toHaveLength(8);
  });
});

describe('describeAudio', () => {
  afterEach(() => jest.resetModules());

  it('returns null when no API key is configured', async () => {
    jest.resetModules();
    jest.doMock('../../config', () => ({
      loadConfig: () => ({ openaiApiKey: undefined, soundCaptionModel: 'test-model' }),
    }));
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { describeAudio } = require('../audioAnalyzer');
    await expect(describeAudio(Buffer.from('x'), 'a.ogg')).resolves.toBeNull();
  });
});
````

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn workspace @rainbot/utils test src/sounds/__tests__/audioAnalyzer.test.ts`
Expected: FAIL — `Cannot find module '../audioAnalyzer'`

- [ ] **Step 3: Write the implementation**

Create `packages/utils/src/sounds/audioAnalyzer.ts`:

````ts
import path from 'path';
import { loadConfig } from '../config';
import { createLogger } from '../logger';
import type { SoundDescription, SoundKind } from './types';

const log = createLogger('SOUND-ANALYZER');

const VALID_KINDS: SoundKind[] = ['speech', 'sound', 'mixed'];
const MAX_TAGS = 8;

export const DESCRIBE_PROMPT = `You are cataloguing short audio clips for a Discord soundboard so people can search for them later.

Listen to the clip and reply with JSON only, no prose and no code fence:
{"kind": "speech" | "sound" | "mixed", "caption": string, "tags": string[]}

- "speech": a person talking, and little else.
- "sound": a sound effect, noise, music sting, or animal - no intelligible speech.
- "mixed": intelligible speech over music or effects.
- caption: one short sentence naming what makes the clip recognizable - the source of the sound and its character. For speech, describe the speaker and delivery rather than repeating their words.
- tags: 3 to 8 short lowercase keyword phrases someone might actually search for.

If there is no intelligible speech, say so with "sound". Do not invent words that were not spoken.`;

/** Parses a model reply into a description, or null when it is unusable. */
export function parseDescription(raw: string): SoundDescription | null {
  const unfenced = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```$/, '')
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(unfenced);
  } catch {
    return null;
  }

  if (typeof parsed !== 'object' || parsed === null) return null;
  const candidate = parsed as { kind?: unknown; caption?: unknown; tags?: unknown };

  if (typeof candidate.kind !== 'string') return null;
  if (!VALID_KINDS.includes(candidate.kind as SoundKind)) return null;
  if (typeof candidate.caption !== 'string') return null;

  const tags = Array.isArray(candidate.tags)
    ? candidate.tags
        .filter((tag): tag is string => typeof tag === 'string')
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0)
        .slice(0, MAX_TAGS)
    : [];

  return { kind: candidate.kind as SoundKind, caption: candidate.caption.trim(), tags };
}

function audioFormatFor(filename: string): string {
  const ext = path.extname(filename).toLowerCase().replace('.', '');
  if (ext === 'oga' || ext === 'opus') return 'ogg';
  if (ext === 'm4a') return 'mp4';
  return ext || 'ogg';
}

/**
 * Classifies and captions a clip in a single call.
 *
 * Returns null on any failure - a missing key, a missing package, a refusal,
 * an unparseable reply. A null must leave the clip unanalyzed rather than
 * writing an empty row, so a transient outage does not mark the whole library
 * as done.
 */
export async function describeAudio(
  buffer: Buffer,
  filename: string
): Promise<SoundDescription | null> {
  const config = loadConfig();
  if (!config.openaiApiKey) {
    log.debug('No OpenAI API key configured - skipping audio description');
    return null;
  }

  let OpenAI: typeof import('openai').OpenAI;
  try {
    // openai is an optionalDependency; a missing package must degrade quietly.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    ({ OpenAI } = require('openai'));
  } catch {
    log.warn('openai package not installed - skipping audio description');
    return null;
  }

  try {
    const client = new OpenAI({ apiKey: config.openaiApiKey });
    const response = await client.chat.completions.create({
      model: config.soundCaptionModel,
      modalities: ['text'],
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: DESCRIBE_PROMPT },
            {
              type: 'input_audio',
              input_audio: {
                data: buffer.toString('base64'),
                format: audioFormatFor(filename),
              },
            },
          ],
        },
      ],
    } as Parameters<typeof client.chat.completions.create>[0]);

    const reply = (response as { choices?: Array<{ message?: { content?: string } }> }).choices?.[0]
      ?.message?.content;
    if (!reply) {
      log.warn(`Empty description reply for ${filename}`);
      return null;
    }

    const description = parseDescription(reply);
    if (!description) log.warn(`Unparseable description reply for ${filename}`);
    return description;
  } catch (error) {
    const err = error as Error;
    log.warn(`Audio description failed for ${filename}: ${err.message}`);
    return null;
  }
}
````

- [ ] **Step 4: Run the test to verify it passes**

Run: `yarn workspace @rainbot/utils test src/sounds/__tests__/audioAnalyzer.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/utils/src/sounds/audioAnalyzer.ts packages/utils/src/sounds/__tests__/audioAnalyzer.test.ts
git commit -m "feat(sounds): classify and caption clips with an audio model"
```

---

### Task 6: Stage 2 — verbatim transcription

Runs only on clips already known to contain speech.

**Files:**

- Create: `packages/utils/src/sounds/speechTranscript.ts`
- Test: `packages/utils/src/sounds/__tests__/speechTranscript.test.ts`

**Interfaces:**

- Consumes: `loadConfig` from `../config`.
- Produces:
  - `interface WhisperSegment { text: string; no_speech_prob?: number; avg_logprob?: number }`
  - `trimHallucinations(segments: WhisperSegment[]): string`
  - `transcribeSpeech(buffer: Buffer, filename: string): Promise<string | null>`
  - `HALLUCINATION_PHRASES: string[]`

- [ ] **Step 1: Write the failing test**

Create `packages/utils/src/sounds/__tests__/speechTranscript.test.ts`:

```ts
import { trimHallucinations } from '../speechTranscript';

describe('trimHallucinations', () => {
  it('keeps confident speech', () => {
    const text = trimHallucinations([
      { text: ' you are gay', no_speech_prob: 0.01, avg_logprob: -0.2 },
    ]);
    expect(text).toBe('you are gay');
  });

  it('drops segments Whisper itself flags as probably silence', () => {
    const text = trimHallucinations([
      { text: 'real words', no_speech_prob: 0.1, avg_logprob: -0.3 },
      { text: 'Thank you.', no_speech_prob: 0.92, avg_logprob: -0.4 },
    ]);
    expect(text).toBe('real words');
  });

  it('drops segments with very low average confidence', () => {
    const text = trimHallucinations([{ text: 'mumble', no_speech_prob: 0.1, avg_logprob: -2.5 }]);
    expect(text).toBe('');
  });

  it('drops known hallucination boilerplate even when confidently scored', () => {
    const text = trimHallucinations([
      { text: 'Subtitles by the Amara.org community', no_speech_prob: 0.01, avg_logprob: -0.1 },
    ]);
    expect(text).toBe('');
  });

  it('matches hallucination boilerplate case-insensitively', () => {
    const text = trimHallucinations([
      { text: 'thanks for watching!', no_speech_prob: 0.01, avg_logprob: -0.1 },
    ]);
    expect(text).toBe('');
  });

  it('joins surviving segments with single spaces', () => {
    const text = trimHallucinations([
      { text: ' hello ', no_speech_prob: 0.01, avg_logprob: -0.2 },
      { text: ' world ', no_speech_prob: 0.01, avg_logprob: -0.2 },
    ]);
    expect(text).toBe('hello world');
  });

  it('treats missing confidence fields as acceptable', () => {
    expect(trimHallucinations([{ text: 'bruh' }])).toBe('bruh');
  });

  it('returns an empty string for no segments', () => {
    expect(trimHallucinations([])).toBe('');
  });
});

describe('transcribeSpeech', () => {
  afterEach(() => jest.resetModules());

  it('returns null when no API key is configured', async () => {
    jest.resetModules();
    jest.doMock('../../config', () => ({ loadConfig: () => ({ openaiApiKey: undefined }) }));
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { transcribeSpeech } = require('../speechTranscript');
    await expect(transcribeSpeech(Buffer.from('x'), 'a.ogg')).resolves.toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn workspace @rainbot/utils test src/sounds/__tests__/speechTranscript.test.ts`
Expected: FAIL — `Cannot find module '../speechTranscript'`

- [ ] **Step 3: Write the implementation**

Create `packages/utils/src/sounds/speechTranscript.ts`:

```ts
import { Readable } from 'stream';
import { loadConfig } from '../config';
import { createLogger } from '../logger';

const log = createLogger('SOUND-TRANSCRIPT');

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
 */
export async function transcribeSpeech(buffer: Buffer, filename: string): Promise<string | null> {
  const config = loadConfig();
  if (!config.openaiApiKey) return null;

  let OpenAI: typeof import('openai').OpenAI;
  try {
    // openai is an optionalDependency; a missing package must degrade quietly.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    ({ OpenAI } = require('openai'));
  } catch {
    log.warn('openai package not installed - skipping transcription');
    return null;
  }

  try {
    const client = new OpenAI({ apiKey: config.openaiApiKey });
    const stream = Readable.from(buffer) as Readable & { path?: string };
    stream.path = filename;

    const response = await client.audio.transcriptions.create({
      file: stream as unknown as Parameters<typeof client.audio.transcriptions.create>[0]['file'],
      model: 'whisper-1',
      response_format: 'verbose_json',
    });

    const segments = (response as unknown as { segments?: WhisperSegment[] }).segments;
    if (!segments) {
      const text = (response as unknown as { text?: string }).text ?? '';
      return text.trim() || null;
    }

    const trimmed = trimHallucinations(segments);
    return trimmed || null;
  } catch (error) {
    const err = error as Error;
    log.warn(`Transcription failed for ${filename}: ${err.message}`);
    return null;
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `yarn workspace @rainbot/utils test src/sounds/__tests__/speechTranscript.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/utils/src/sounds/speechTranscript.ts packages/utils/src/sounds/__tests__/speechTranscript.test.ts
git commit -m "feat(sounds): transcribe speech clips verbatim with a hallucination trim"
```

---

### Task 7: Text embeddings

**Files:**

- Create: `packages/utils/src/sounds/embeddings.ts`
- Test: `packages/utils/src/sounds/__tests__/embeddings.test.ts`

**Interfaces:**

- Consumes: `loadConfig` from `../config`.
- Produces:
  - `embedText(text: string): Promise<number[] | null>`
  - `clearEmbeddingCache(): void`
  - `shouldUseSemantic(query: string, lexicalHitCount: number): boolean`

- [ ] **Step 1: Write the failing test**

Create `packages/utils/src/sounds/__tests__/embeddings.test.ts`:

```ts
import { shouldUseSemantic } from '../embeddings';

describe('shouldUseSemantic', () => {
  it('declines a query shorter than four characters', () => {
    expect(shouldUseSemantic('air', 0)).toBe(false);
  });

  it('declines when lexical matching already found plenty', () => {
    expect(shouldUseSemantic('air horn', 9)).toBe(false);
  });

  it('engages when a long enough query found too little', () => {
    expect(shouldUseSemantic('angry yelling', 1)).toBe(true);
  });

  it('declines an empty query', () => {
    expect(shouldUseSemantic('', 0)).toBe(false);
  });

  it('counts characters after trimming', () => {
    expect(shouldUseSemantic('  ai  ', 0)).toBe(false);
  });
});

describe('embedText', () => {
  afterEach(() => jest.resetModules());

  it('returns null when no API key is configured', async () => {
    jest.resetModules();
    jest.doMock('../../config', () => ({
      loadConfig: () => ({ openaiApiKey: undefined, soundEmbeddingModel: 'test-model' }),
    }));
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { embedText } = require('../embeddings');
    await expect(embedText('air horn')).resolves.toBeNull();
  });

  it('returns null for empty text without calling out', async () => {
    jest.resetModules();
    jest.doMock('../../config', () => ({
      loadConfig: () => ({ openaiApiKey: 'key', soundEmbeddingModel: 'test-model' }),
    }));
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { embedText } = require('../embeddings');
    await expect(embedText('   ')).resolves.toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn workspace @rainbot/utils test src/sounds/__tests__/embeddings.test.ts`
Expected: FAIL — `Cannot find module '../embeddings'`

- [ ] **Step 3: Write the implementation**

Create `packages/utils/src/sounds/embeddings.ts`:

```ts
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

  let OpenAI: typeof import('openai').OpenAI;
  try {
    // openai is an optionalDependency; a missing package must degrade quietly.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `yarn workspace @rainbot/utils test src/sounds/__tests__/embeddings.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/utils/src/sounds/embeddings.ts packages/utils/src/sounds/__tests__/embeddings.test.ts
git commit -m "feat(sounds): embed query and document text with an LRU cache"
```

---

### Task 8: The analysis orchestrator and the backfill sweep

**Files:**

- Create: `packages/utils/src/sounds/analyzeSound.ts`
- Test: `packages/utils/src/sounds/__tests__/analyzeSound.test.ts`

**Interfaces:**

- Consumes: `describeAudio` (Task 5), `transcribeSpeech` (Task 6), `embedText` (Task 7), `upsertAnalysis`/`getAnalysisSizes`/`detectVectorSupport` (Task 4), `buildSearchDoc` (Task 1), `loadConfig`, and `getSoundBuffer`/`listSounds` from `../storage`.
- Produces:
  - `analyzeSound(name: string, options?: { displayName?: string | null; size?: number | null }): Promise<SoundAnalysis | null>`
  - `sweepAnalyzeSounds(options?: { force?: boolean; limit?: number; concurrency?: number }): Promise<{ analyzed: number; skipped: number; failed: number }>`

Note: `packages/utils/src/storage.ts` exposes `getSoundStream` but no buffer helper. Add one beside it — `export async function getSoundBuffer(filename: string): Promise<Buffer>` — reusing the existing `bodyToBuffer`/`streamToBuffer` helpers already in that file.

- [ ] **Step 1: Write the failing test**

Create `packages/utils/src/sounds/__tests__/analyzeSound.test.ts`:

```ts
const mockDescribeAudio = jest.fn();
const mockTranscribeSpeech = jest.fn();
const mockEmbedText = jest.fn();
const mockUpsertAnalysis = jest.fn();
const mockGetAnalysisSizes = jest.fn();
const mockGetSoundBuffer = jest.fn();
const mockListSounds = jest.fn();

jest.mock('../audioAnalyzer', () => ({
  describeAudio: (...a: unknown[]) => mockDescribeAudio(...a),
}));
jest.mock('../speechTranscript', () => ({
  transcribeSpeech: (...a: unknown[]) => mockTranscribeSpeech(...a),
}));
jest.mock('../embeddings', () => ({ embedText: (...a: unknown[]) => mockEmbedText(...a) }));
jest.mock('../analysisRepo', () => ({
  upsertAnalysis: (...a: unknown[]) => mockUpsertAnalysis(...a),
  getAnalysisSizes: (...a: unknown[]) => mockGetAnalysisSizes(...a),
  detectVectorSupport: jest.fn(async () => false),
}));
jest.mock('../../storage', () => ({
  getSoundBuffer: (...a: unknown[]) => mockGetSoundBuffer(...a),
  listSounds: (...a: unknown[]) => mockListSounds(...a),
}));
jest.mock('../../config', () => ({
  loadConfig: () => ({ soundAnalysisEnabled: true, soundCaptionModel: 'test-model' }),
}));

import { analyzeSound, sweepAnalyzeSounds } from '../analyzeSound';

beforeEach(() => {
  jest.clearAllMocks();
  mockGetSoundBuffer.mockResolvedValue(Buffer.from('audio'));
  mockEmbedText.mockResolvedValue([0.1, 0.2]);
  mockUpsertAnalysis.mockResolvedValue(undefined);
});

describe('analyzeSound', () => {
  it('never transcribes a clip classified as sound', async () => {
    mockDescribeAudio.mockResolvedValue({
      kind: 'sound',
      caption: 'a loud air horn blast',
      tags: ['air horn'],
    });

    const result = await analyzeSound('airhorn.ogg');

    expect(mockTranscribeSpeech).not.toHaveBeenCalled();
    expect(result?.transcript).toBeNull();
    expect(result?.kind).toBe('sound');
  });

  it('transcribes a clip classified as speech', async () => {
    mockDescribeAudio.mockResolvedValue({ kind: 'speech', caption: 'a man yells', tags: ['yell'] });
    mockTranscribeSpeech.mockResolvedValue('you are gay');

    const result = await analyzeSound('yougay.ogg');

    expect(mockTranscribeSpeech).toHaveBeenCalledTimes(1);
    expect(result?.transcript).toBe('you are gay');
  });

  it('transcribes a mixed clip and keeps both fields', async () => {
    mockDescribeAudio.mockResolvedValue({
      kind: 'mixed',
      caption: 'shouting over a beat',
      tags: ['shout'],
    });
    mockTranscribeSpeech.mockResolvedValue('lets go');

    const result = await analyzeSound('hype.ogg');

    expect(result?.transcript).toBe('lets go');
    expect(result?.caption).toBe('shouting over a beat');
  });

  it('folds the caption and tags into the search document', async () => {
    mockDescribeAudio.mockResolvedValue({
      kind: 'sound',
      caption: 'a loud air horn blast',
      tags: ['air horn'],
    });

    const result = await analyzeSound('ah.ogg');

    expect(result?.searchDoc).toContain('air horn');
    expect(result?.searchDoc).toContain('blast');
  });

  it('writes nothing when description fails', async () => {
    mockDescribeAudio.mockResolvedValue(null);

    await expect(analyzeSound('broken.ogg')).resolves.toBeNull();
    expect(mockUpsertAnalysis).not.toHaveBeenCalled();
  });

  it('still stores the row when embedding fails', async () => {
    mockDescribeAudio.mockResolvedValue({ kind: 'sound', caption: 'a thud', tags: ['thud'] });
    mockEmbedText.mockResolvedValue(null);

    await expect(analyzeSound('thud.ogg')).resolves.not.toBeNull();
    expect(mockUpsertAnalysis).toHaveBeenCalledWith(expect.anything(), null);
  });
});

describe('sweepAnalyzeSounds', () => {
  beforeEach(() => {
    mockDescribeAudio.mockResolvedValue({ kind: 'sound', caption: 'a thud', tags: ['thud'] });
  });

  it('skips clips whose recorded size is unchanged', async () => {
    mockListSounds.mockResolvedValue([{ name: 'a.ogg', size: 100, createdAt: new Date() }]);
    mockGetAnalysisSizes.mockResolvedValue(new Map([['a.ogg', 100]]));

    await expect(sweepAnalyzeSounds()).resolves.toEqual({ analyzed: 0, skipped: 1, failed: 0 });
  });

  it('re-analyzes a clip whose size changed', async () => {
    mockListSounds.mockResolvedValue([{ name: 'a.ogg', size: 200, createdAt: new Date() }]);
    mockGetAnalysisSizes.mockResolvedValue(new Map([['a.ogg', 100]]));

    await expect(sweepAnalyzeSounds()).resolves.toEqual({ analyzed: 1, skipped: 0, failed: 0 });
  });

  it('re-analyzes everything under force, ignoring recorded sizes', async () => {
    mockListSounds.mockResolvedValue([{ name: 'a.ogg', size: 100, createdAt: new Date() }]);
    mockGetAnalysisSizes.mockResolvedValue(new Map([['a.ogg', 100]]));

    await expect(sweepAnalyzeSounds({ force: true })).resolves.toEqual({
      analyzed: 1,
      skipped: 0,
      failed: 0,
    });
  });

  it('counts a failed clip without aborting the sweep', async () => {
    mockListSounds.mockResolvedValue([
      { name: 'a.ogg', size: 1, createdAt: new Date() },
      { name: 'b.ogg', size: 1, createdAt: new Date() },
    ]);
    mockGetAnalysisSizes.mockResolvedValue(new Map());
    mockDescribeAudio.mockResolvedValueOnce(null);

    await expect(sweepAnalyzeSounds()).resolves.toEqual({ analyzed: 1, skipped: 0, failed: 1 });
  });

  it('honours a limit', async () => {
    mockListSounds.mockResolvedValue([
      { name: 'a.ogg', size: 1, createdAt: new Date() },
      { name: 'b.ogg', size: 1, createdAt: new Date() },
    ]);
    mockGetAnalysisSizes.mockResolvedValue(new Map());

    await expect(sweepAnalyzeSounds({ limit: 1 })).resolves.toEqual({
      analyzed: 1,
      skipped: 0,
      failed: 0,
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn workspace @rainbot/utils test src/sounds/__tests__/analyzeSound.test.ts`
Expected: FAIL — `Cannot find module '../analyzeSound'`

- [ ] **Step 3: Write the implementation**

First add to `packages/utils/src/storage.ts`, beside `getSoundStream`:

```ts
/** Reads a stored sound fully into memory, for analysis. */
export async function getSoundBuffer(filename: string): Promise<Buffer> {
  const stream = await getSoundStream(filename);
  return streamToBuffer(stream as unknown as AsyncIterable<Uint8Array>);
}
```

Create `packages/utils/src/sounds/analyzeSound.ts`:

```ts
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

  const transcript = description.kind === 'sound' ? null : await transcribeSpeech(buffer, name);

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

/** Backfills analysis across the library, skipping clips that have not changed. */
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
      batch.map(async (sound) => analyzeSound(sound.name, { size: sound.size }))
    );
    for (const result of results) {
      if (result) analyzed += 1;
      else failed += 1;
    }
  }

  log.info(`Sweep complete: ${analyzed} analyzed, ${skipped} skipped, ${failed} failed`);
  return { analyzed, skipped, failed };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `yarn workspace @rainbot/utils test src/sounds/__tests__/analyzeSound.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/utils/src/sounds/analyzeSound.ts packages/utils/src/sounds/__tests__/analyzeSound.test.ts packages/utils/src/storage.ts
git commit -m "feat(sounds): route clips to transcription or captioning by kind"
```

---

### Task 9: The search function

The one function both surfaces call. Its defining property: it never returns worse results than today's filename filter, whatever is unavailable.

**Files:**

- Create: `packages/utils/src/sounds/soundSearch.ts`
- Create: `packages/utils/src/sounds/index.ts`
- Modify: `packages/utils/src/index.ts`
- Test: `packages/utils/src/sounds/__tests__/soundSearch.test.ts`

**Interfaces:**

- Consumes: `normalizeForSearch` (Task 1), `fuseRankings`/`pinExactPrefix` (Task 2), `lexicalSearch`/`vectorSearch`/`getAnalysisFor` (Task 4), `embedText`/`shouldUseSemantic` (Task 7).
- Produces:
  - `interface SearchableSound { name: string; displayName?: string | null }`
  - `searchSounds(options: { query: string; sounds: SearchableSound[]; limit?: number; allowSemantic?: boolean }): Promise<SoundSearchResult[]>`
  - `matchNamesLocally(query: string, sounds: SearchableSound[]): string[]`

- [ ] **Step 1: Write the failing test**

Create `packages/utils/src/sounds/__tests__/soundSearch.test.ts`:

```ts
const mockLexicalSearch = jest.fn();
const mockVectorSearch = jest.fn();
const mockGetAnalysisFor = jest.fn();
const mockEmbedText = jest.fn();

jest.mock('../analysisRepo', () => ({
  lexicalSearch: (...a: unknown[]) => mockLexicalSearch(...a),
  vectorSearch: (...a: unknown[]) => mockVectorSearch(...a),
  getAnalysisFor: (...a: unknown[]) => mockGetAnalysisFor(...a),
}));
jest.mock('../embeddings', () => ({
  embedText: (...a: unknown[]) => mockEmbedText(...a),
  shouldUseSemantic: jest.requireActual('../embeddings').shouldUseSemantic,
}));

import { searchSounds, matchNamesLocally } from '../soundSearch';

const library = [{ name: 'airhorn.ogg' }, { name: 'yougay.ogg' }, { name: 'trombone.ogg' }];

beforeEach(() => {
  jest.clearAllMocks();
  mockLexicalSearch.mockResolvedValue([]);
  mockVectorSearch.mockResolvedValue([]);
  mockGetAnalysisFor.mockResolvedValue(new Map());
  mockEmbedText.mockResolvedValue(null);
});

describe('matchNamesLocally', () => {
  it('matches a spaced query against a squashed filename', () => {
    expect(matchNamesLocally('air horn', library)).toEqual(['airhorn.ogg']);
  });

  it('ranks a prefix match ahead of a mid-string match', () => {
    const sounds = [{ name: 'loudairhorn.ogg' }, { name: 'airhorn.ogg' }];
    expect(matchNamesLocally('air', sounds)[0]).toBe('airhorn.ogg');
  });

  it('matches against a display name too', () => {
    const sounds = [{ name: 'xyz.ogg', displayName: 'Sad Trombone' }];
    expect(matchNamesLocally('trombone', sounds)).toEqual(['xyz.ogg']);
  });

  it('returns everything for an empty query', () => {
    expect(matchNamesLocally('', library)).toHaveLength(3);
  });
});

describe('searchSounds', () => {
  it('finds a sound by filename with no database and no embeddings', async () => {
    const results = await searchSounds({ query: 'air horn', sounds: library });
    expect(results[0]?.name).toBe('airhorn.ogg');
    expect(results[0]?.matchedOn).toBe('name');
  });

  it('never calls out for embeddings when a name match already succeeded', async () => {
    await searchSounds({ query: 'airhorn', sounds: library });
    expect(mockEmbedText).not.toHaveBeenCalled();
  });

  it('runs a semantic pass when lexical matching found nothing', async () => {
    mockEmbedText.mockResolvedValue([0.1, 0.2]);
    mockVectorSearch.mockResolvedValue(['trombone.ogg']);
    mockGetAnalysisFor.mockResolvedValue(
      new Map([
        [
          'trombone.ogg',
          {
            soundName: 'trombone.ogg',
            kind: 'sound',
            transcript: null,
            caption: 'a descending sad trombone',
            tags: ['trombone'],
            searchDoc: 'x',
            sourceSize: 1,
            model: 'm',
          },
        ],
      ])
    );

    const results = await searchSounds({ query: 'disappointment noise', sounds: library });
    expect(results[0]?.name).toBe('trombone.ogg');
    expect(results[0]?.matchedOn).toBe('semantic');
    expect(results[0]?.snippet).toBe('a descending sad trombone');
  });

  it('skips the semantic pass when allowSemantic is false', async () => {
    await searchSounds({ query: 'disappointment noise', sounds: library, allowSemantic: false });
    expect(mockEmbedText).not.toHaveBeenCalled();
  });

  it('shows the transcript as the snippet for a speech match', async () => {
    mockLexicalSearch.mockResolvedValue(['yougay.ogg']);
    mockGetAnalysisFor.mockResolvedValue(
      new Map([
        [
          'yougay.ogg',
          {
            soundName: 'yougay.ogg',
            kind: 'speech',
            transcript: 'you are gay',
            caption: 'a man shouting',
            tags: [],
            searchDoc: 'x',
            sourceSize: 1,
            model: 'm',
          },
        ],
      ])
    );

    const results = await searchSounds({ query: 'you are gay', sounds: library });
    const hit = results.find((result) => result.name === 'yougay.ogg');
    expect(hit?.snippet).toBe('you are gay');
    expect(hit?.matchedOn).toBe('transcript');
  });

  it('never returns a sound absent from the supplied library', async () => {
    mockLexicalSearch.mockResolvedValue(['deleted.ogg']);
    const results = await searchSounds({ query: 'deleted', sounds: library });
    expect(results.map((result) => result.name)).not.toContain('deleted.ogg');
  });

  it('returns everything for an empty query', async () => {
    const results = await searchSounds({ query: '', sounds: library });
    expect(results).toHaveLength(3);
  });

  it('honours the limit', async () => {
    const results = await searchSounds({ query: '', sounds: library, limit: 2 });
    expect(results).toHaveLength(2);
  });

  it('survives a lexical search that throws', async () => {
    mockLexicalSearch.mockRejectedValue(new Error('db down'));
    const results = await searchSounds({ query: 'air horn', sounds: library });
    expect(results[0]?.name).toBe('airhorn.ogg');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn workspace @rainbot/utils test src/sounds/__tests__/soundSearch.test.ts`
Expected: FAIL — `Cannot find module '../soundSearch'`

- [ ] **Step 3: Write the implementation**

Create `packages/utils/src/sounds/soundSearch.ts`:

```ts
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

  if (allowSemantic && shouldUseSemantic(query, lexicalHitCount)) {
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
```

Create `packages/utils/src/sounds/index.ts`:

```ts
export * from './analysisRepo';
export * from './analyzeSound';
export * from './audioAnalyzer';
export * from './embeddings';
export * from './rankFusion';
export * from './searchText';
export * from './soundSearch';
export * from './speechTranscript';
export * from './types';
```

Add to `packages/utils/src/index.ts`, keeping the list alphabetical:

```ts
export * from './sounds';
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `yarn workspace @rainbot/utils test src/sounds/__tests__/soundSearch.test.ts`
Expected: PASS, 14 tests.

Then confirm nothing else broke: `yarn build:ts && yarn workspace @rainbot/utils test`
Expected: PASS. If `export * from './sounds'` collides with an existing export, rename the loser inside `sounds/` — do not remove the barrel export.

- [ ] **Step 5: Commit**

```bash
git add packages/utils/src/sounds/soundSearch.ts packages/utils/src/sounds/index.ts packages/utils/src/sounds/__tests__/soundSearch.test.ts packages/utils/src/index.ts
git commit -m "feat(sounds): hybrid sound search that degrades to filename matching"
```

---

### Task 10: API routes and the upload hook

**Files:**

- Modify: `apps/raincloud/server/routes/api.ts` (add handlers; the sounds routes begin at line 340, upload at line 422, the transcode sweep at line 672)
- Modify: `apps/raincloud/server/swagger.ts`
- Test: `apps/raincloud/server/routes/__tests__/sound-search.test.ts`

**Interfaces:**

- Consumes: `searchSounds`, `analyzeSound`, `sweepAnalyzeSounds` from `@rainbot/utils`; `storage.listSounds`; `query` from `@rainbot/utils/database`.
- Produces:
  - `export async function searchSoundsHandler(req, res): Promise<void>` — exported for tests, following the pattern of `getUserSoundsHandler` in `apps/raincloud/server/routes/stats.ts`
  - `GET /api/sounds/search?q=&limit=` → `{ results: SoundSearchResult[] }`
  - `POST /api/sounds/analyze-sweep` with body `{ force?: boolean; limit?: number }` → `{ analyzed, skipped, failed }`

- [ ] **Step 1: Write the failing test**

Create `apps/raincloud/server/routes/__tests__/sound-search.test.ts`:

```ts
const mockSearchSounds = jest.fn();
const mockListSounds = jest.fn();
const mockQuery = jest.fn();

// api.ts imports all three from @rainbot/utils at module load, so all three
// must exist on the mock even though only searchSounds is exercised here.
jest.mock('@rainbot/utils', () => ({
  searchSounds: (...a: unknown[]) => mockSearchSounds(...a),
  analyzeSound: jest.fn(),
  sweepAnalyzeSounds: jest.fn(),
}));
jest.mock('@rainbot/utils/storage', () => ({
  listSounds: (...a: unknown[]) => mockListSounds(...a),
}));
jest.mock('@rainbot/utils/database', () => ({ query: (...a: unknown[]) => mockQuery(...a) }));

import { searchSoundsHandler } from '../api';

function makeRes() {
  const json = jest.fn();
  const status = jest.fn(() => ({ json }));
  return { res: { status, json } as never, json, status };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockListSounds.mockResolvedValue([{ name: 'airhorn.ogg', size: 1, createdAt: new Date() }]);
  mockQuery.mockResolvedValue({ rows: [] });
  mockSearchSounds.mockResolvedValue([
    { name: 'airhorn.ogg', score: 1, matchedOn: 'name', snippet: null },
  ]);
});

describe('searchSoundsHandler', () => {
  it('returns ranked results for a query', async () => {
    const { res, json } = makeRes();
    await searchSoundsHandler({ query: { q: 'air horn' } } as never, res);
    expect(json).toHaveBeenCalledWith({
      results: [{ name: 'airhorn.ogg', score: 1, matchedOn: 'name', snippet: null }],
    });
  });

  it('treats a missing q as an empty query rather than an error', async () => {
    const { res, status } = makeRes();
    await searchSoundsHandler({ query: {} } as never, res);
    expect(status).not.toHaveBeenCalledWith(400);
  });

  it('passes display names from customizations into the search', async () => {
    mockQuery.mockResolvedValue({
      rows: [{ sound_name: 'airhorn.ogg', display_name: 'Air Horn', emoji: null }],
    });
    const { res } = makeRes();
    await searchSoundsHandler({ query: { q: 'air' } } as never, res);

    const [options] = mockSearchSounds.mock.calls[0] as [
      { sounds: Array<{ displayName?: string }> },
    ];
    expect(options.sounds[0]?.displayName).toBe('Air Horn');
  });

  it('clamps an absurd limit', async () => {
    const { res } = makeRes();
    await searchSoundsHandler({ query: { q: 'air', limit: '9999' } } as never, res);
    const [options] = mockSearchSounds.mock.calls[0] as [{ limit: number }];
    expect(options.limit).toBeLessThanOrEqual(100);
  });

  it('returns 500 when listing sounds fails', async () => {
    mockListSounds.mockRejectedValue(new Error('storage down'));
    const { res, status } = makeRes();
    await searchSoundsHandler({ query: { q: 'air' } } as never, res);
    expect(status).toHaveBeenCalledWith(500);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn build:ts && yarn workspace @rainbot/raincloud test server/routes/__tests__/sound-search.test.ts`
Expected: FAIL — `searchSoundsHandler` is not exported.

- [ ] **Step 3: Write the implementation**

Add to the imports at the top of `apps/raincloud/server/routes/api.ts`:

```ts
import { searchSounds, analyzeSound, sweepAnalyzeSounds } from '@rainbot/utils';
```

Add the handler and its route beside the other sounds routes. Place the route **before** `/sounds/:name/download`, so `search` is not captured as a sound name:

```ts
const MAX_SEARCH_LIMIT = 100;

/** Exported for tests; mounted below as GET /api/sounds/search. */
export async function searchSoundsHandler(req: Request, res: Response): Promise<void> {
  try {
    const rawQuery = typeof req.query['q'] === 'string' ? req.query['q'] : '';
    const rawLimit = Number(req.query['limit'] ?? 50);
    const limit = Number.isFinite(rawLimit)
      ? Math.min(Math.max(Math.trunc(rawLimit), 1), MAX_SEARCH_LIMIT)
      : 50;

    const sounds = await storage.listSounds();

    const customizations = await query(`SELECT sound_name, display_name FROM sound_customizations`);
    const displayNames = new Map<string, string | null>();
    if (customizations) {
      for (const row of customizations.rows as Array<{
        sound_name: string;
        display_name: string | null;
      }>) {
        displayNames.set(row.sound_name, row.display_name);
      }
    }

    const results = await searchSounds({
      query: rawQuery,
      limit,
      sounds: sounds.map((sound) => ({
        name: sound.name,
        displayName: displayNames.get(sound.name) ?? null,
      })),
    });

    res.json({ results });
  } catch (error) {
    const err = error as Error;
    res.status(500).json({ error: err.message });
  }
}

// GET /api/sounds/search - Search sounds by name, transcript, or description
router.get('/sounds/search', requireAuth, searchSoundsHandler);

// POST /api/sounds/analyze-sweep - Backfill analysis across the sound library
router.post(
  '/sounds/analyze-sweep',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const force = req.body?.force === true;
      const rawLimit = Number(req.body?.limit || 0);
      const result = await sweepAnalyzeSounds({
        force,
        limit: Number.isFinite(rawLimit) ? rawLimit : 0,
      });
      res.json(result);
    } catch (error) {
      const err = error as Error;
      res.status(500).json({ error: err.message });
    }
  }
);
```

In the upload loop in `POST /api/sounds`, immediately after `results.push({ ... })`:

```ts
// Analysis runs after the upload has been transcoded, since transcode
// rewrites the stored object. Deliberately not awaited: upload latency
// must not depend on an audio model.
void analyzeSound(filename, { size: file.size }).catch(() => {
  /* analysis is best-effort; the sweep will retry it */
});
```

In the `DELETE /api/sounds/:name` handler, beside the existing `deleteSoundCustomization` cleanup:

```ts
try {
  await query(`DELETE FROM sound_analysis WHERE sound_name = $1`, [filename]);
} catch {
  // Best-effort cleanup if DB is unavailable.
}
```

Add both routes to `apps/raincloud/server/swagger.ts`, matching the shape of the existing `/sounds/transcode-sweep` entry: `GET /sounds/search` with a `q` string query parameter and an optional integer `limit`, returning `{ results: [{ name, score, matchedOn, snippet }] }`; `POST /sounds/analyze-sweep` with a body of `{ force?: boolean, limit?: integer }`, returning `{ analyzed, skipped, failed }`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `yarn build:ts && yarn workspace @rainbot/raincloud test server/routes/__tests__/sound-search.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/raincloud/server/routes/api.ts apps/raincloud/server/swagger.ts apps/raincloud/server/routes/__tests__/sound-search.test.ts
git commit -m "feat(api): add sound search and analysis sweep endpoints"
```

---

### Task 11: Discord `/play` autocomplete

**Files:**

- Modify: `apps/raincloud/src/events/interactionCreate.js:22-80`

**Interfaces:**

- Consumes: `searchSounds` from `@rainbot/utils`; `voiceManager.listSounds()`.
- Produces: no new exports.

This file is CommonJS and is `require`d from `index.js`. Use `require`, not `import`.

- [ ] **Step 1: Replace the filter with a search call**

In `apps/raincloud/src/events/interactionCreate.js`, replace the body of the `if (focusedOption.name === 'source')` block — the `let filtered; ... const choices = ...` section at lines 30-43 — with:

```js
const sounds = await voiceManager.listSounds();
const input = focusedOption.value.trim();

// Semantic search is off here on purpose: autocomplete fires on
// every keystroke against Discord's 3 second budget, and an
// embedding round-trip per keystroke would blow both the latency
// and the API bill. The dashboard, which debounces, keeps it.
const results = await searchSounds({
  query: input,
  sounds: sounds.map((sound) => ({ name: sound.name })),
  limit: 25,
  allowSemantic: false,
});

const choices = results.slice(0, 25).map((result) => {
  const label = result.snippet ? `${result.name} — ${result.snippet}` : result.name;
  return {
    name: label.length > 100 ? `${label.substring(0, 97)}...` : label,
    value: result.name,
  };
});
```

Keep the surrounding `try`/`catch`, the `await interaction.respond(choices)` call, and both `stats.trackInteraction` calls exactly as they are. The success-path tracking metadata still reads `{ query: input, resultsShown: choices.length, totalSounds: sounds.length }`, so `sounds` must stay in scope.

Add to the requires at the top of the file:

```js
const { searchSounds } = require('@rainbot/utils');
```

- [ ] **Step 2: Verify the bot still builds and starts**

Run: `yarn build:ts && yarn workspace @rainbot/raincloud lint`
Expected: no errors. A bare-path import violation here means the require was written as `require('utils/...')` — use `@rainbot/utils`.

- [ ] **Step 3: Verify the full test suite still passes**

Run: `yarn test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/raincloud/src/events/interactionCreate.js
git commit -m "feat(discord): search transcripts and descriptions in /play autocomplete"
```

---

### Task 12: Dashboard search

**Files:**

- Modify: `ui/src/types/index.ts` (the `Sound` interface at line 24)
- Modify: `ui/src/lib/api.ts` (the `soundsApi` object at line 142)
- Create: `ui/src/hooks/useDebouncedValue.ts`
- Modify: `ui/src/components/tabs/SoundboardTab.tsx` (the filter at lines 123-128, the grid at line 259)
- Modify: `ui/src/components/soundboard/SoundCard.tsx`
- Modify: `ui/src/components/tabs/AdminTab.tsx` (beside the existing `sweepMutation` at line 63)

**Interfaces:**

- Consumes: `GET /api/sounds/search`, `POST /api/sounds/analyze-sweep` from Task 10.
- Produces:
  - `interface SoundSearchResult { name: string; score: number; matchedOn: 'name' | 'transcript' | 'caption' | 'semantic'; snippet: string | null }`
  - `soundsApi.search(query: string)`, `soundsApi.analyzeSweep(options?)`
  - `useDebouncedValue<T>(value: T, delayMs: number): T`
  - `SoundCard` gains an optional `snippet?: string | null` prop.

- [ ] **Step 1: Add the type and the API client methods**

Add to `ui/src/types/index.ts`:

```ts
export interface SoundSearchResult {
  name: string;
  score: number;
  matchedOn: 'name' | 'transcript' | 'caption' | 'semantic';
  snippet: string | null;
}
```

Add to `soundsApi` in `ui/src/lib/api.ts`:

```ts
  search: (query: string) => api.get('/sounds/search', { params: { q: query, limit: 100 } }),
  analyzeSweep: (options?: { force?: boolean; limit?: number }) =>
    api.post('/sounds/analyze-sweep', options || {}),
```

- [ ] **Step 2: Add the debounce hook**

Create `ui/src/hooks/useDebouncedValue.ts`:

```ts
import { useEffect, useState } from 'react';

/** Settles on a value only after it has stopped changing for `delayMs`. */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [settled, setSettled] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return settled;
}
```

- [ ] **Step 3: Wire the search into SoundboardTab**

Add to the imports:

```ts
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import type { Sound, SoundSearchResult } from '@/types';
```

Add after the existing `sounds` query:

```ts
const debouncedQuery = useDebouncedValue(searchQuery, 200);

const { data: searchResults } = useQuery({
  queryKey: ['sound-search', debouncedQuery],
  queryFn: () => soundsApi.search(debouncedQuery).then((res) => res.data.results),
  enabled: debouncedQuery.trim().length > 0,
});
```

Replace the `filteredSounds` block (lines 123-128) with:

```ts
// Local filtering is the immediate, always-correct baseline. Server results
// replace it once they land, so typing never waits on a round-trip and a
// failed request degrades to exactly the old behaviour.
const locallyFiltered = visibleSounds.filter((sound: Sound) => {
  const custom = getCustomization(sound.name);
  const searchTarget = `${sound.name} ${custom?.displayName || ''} ${custom?.emoji || ''}`;
  const squash = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');
  return squash(searchTarget).includes(squash(searchQuery));
});

const snippets = new Map<string, string | null>(
  (searchResults ?? []).map((result: SoundSearchResult) => [result.name, result.snippet])
);

const isSearchCurrent = debouncedQuery === searchQuery && searchResults !== undefined;
const byName = new Map(visibleSounds.map((sound: Sound) => [sound.name, sound]));
const filteredSounds =
  searchQuery.trim() && isSearchCurrent
    ? (searchResults as SoundSearchResult[])
        .map((result) => byName.get(result.name))
        .filter((sound): sound is Sound => sound !== undefined)
    : locallyFiltered;
```

Pass the snippet to each card in the grid:

```tsx
                snippet={snippets.get(sound.name) ?? null}
```

- [ ] **Step 4: Show the snippet on the card**

Add `snippet?: string | null;` to `SoundCardProps` in `ui/src/components/soundboard/SoundCard.tsx`, accept it in the destructured parameters, and render it directly after the existing size line:

```tsx
{
  snippet && (
    <div className="text-[11px] text-text-muted italic mt-1 line-clamp-2" title={snippet}>
      "{snippet}"
    </div>
  );
}
```

A semantic hit is otherwise unexplainable — the user sees a clip whose name has nothing to do with what they typed. The snippet is what makes the result legible rather than arbitrary.

- [ ] **Step 5: Add the backfill button to AdminTab**

Add beside the existing `sweepMutation` in `ui/src/components/tabs/AdminTab.tsx`:

```ts
const [analyzeResult, setAnalyzeResult] = useState<string | null>(null);

const analyzeSweepMutation = useMutation({
  mutationFn: (options: { force: boolean }) => soundsApi.analyzeSweep(options),
  onSuccess: (res) => {
    const data = res.data as { analyzed: number; skipped: number; failed: number };
    setAnalyzeResult(`Analyzed ${data.analyzed}, skipped ${data.skipped}, failed ${data.failed}.`);
    queryClient.invalidateQueries({ queryKey: ['sound-search'] });
  },
  onError: (err: { response?: { data?: { error?: string } }; message?: string }) => {
    setAnalyzeResult(err.response?.data?.error ?? err.message ?? 'Analysis sweep failed.');
  },
});
```

Render it inside the same `DisplayCard` as the transcode sweep button, following that button's existing markup and class names:

```tsx
<button
  type="button"
  onClick={() => analyzeSweepMutation.mutate({ force: false })}
  disabled={analyzeSweepMutation.isPending}
>
  {analyzeSweepMutation.isPending ? 'Analyzing...' : 'Analyze sounds for search'}
</button>;
{
  analyzeResult && <p>{analyzeResult}</p>;
}
```

- [ ] **Step 6: Verify the UI builds and lints**

Run: `yarn build:ui && yarn workspace @rainbot/ui lint`
Expected: no errors.

- [ ] **Step 7: Full validation**

Run: `yarn validate`
Expected: PASS — type-check, format:check, and every test.

- [ ] **Step 8: Commit**

```bash
git add ui/src/types/index.ts ui/src/lib/api.ts ui/src/hooks/useDebouncedValue.ts ui/src/components/tabs/SoundboardTab.tsx ui/src/components/soundboard/SoundCard.tsx ui/src/components/tabs/AdminTab.tsx
git commit -m "feat(ui): search sounds by transcript and description from the dashboard"
```

---

## Deviations from the spec

**Trigram fuzzy matching is dropped.** The spec called for a `pg_trgm` GIN index to give typo tolerance on filenames. The plan implements the lexical pass with normalized `LIKE` tiers plus `websearch_to_tsquery` and no trigram.

Reason: `pg_trgm` is a second optional extension, which means a second availability check, a second fallback path, and a second thing that can be missing in production — for a benefit the normalization already delivers most of. `airhorn` versus `air horn` is a separator problem, not a spelling problem, and that is now handled deterministically. If real use shows genuine misspellings failing, adding a trigram tier is an additive change to `lexicalSearch` alone, behind the same `detectVectorSupport`-style guard.

## Manual verification

Automated tests stub every model call, so the real output quality has to be looked at once:

1. Set `OPENAI_API_KEY` and `DATABASE_URL`, then run `yarn build:ts && yarn workspace @rainbot/raincloud dev`.
2. Press **Analyze sounds for search** in the Admin tab and wait for the counts.
3. Query the rows directly and read them: `SELECT sound_name, kind, transcript, caption, tags FROM sound_analysis ORDER BY updated_at DESC LIMIT 20`.
   - Every effect clip should be `kind='sound'` with `transcript IS NULL`. **A non-null transcript on an air horn means classification is leaking and stage 2 is running when it should not** — that is the failure this whole design exists to prevent, so investigate before going further.
   - Captions should name the sound source, not describe the file.
4. In the dashboard, search `air horn` and confirm `airhorn.ogg` ranks first.
5. Search something purely semantic — `disappointment noise`, `someone screaming` — and confirm a sensible clip returns with a snippet explaining why.
6. In Discord, type `/play` and a few characters; confirm choices appear well within the 3 second budget and that labels carry snippets.
7. Check whether pgvector engaged: the Raincloud log says either `pgvector enabled for sound search` or `pgvector unavailable - semantic search will rank in JS`. Both are working states; note which one you got.
