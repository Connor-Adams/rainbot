# Soundboard Semantic Search — Design

Date: 2026-09-19
Status: approved, pending implementation plan

## Problem

Finding a sound on the soundboard requires remembering its filename. Search today is a
single client-side substring test over the filename and display name
(`ui/src/components/tabs/SoundboardTab.tsx:124`, mirrored in the Discord `/play`
autocomplete at `apps/raincloud/src/events/interactionCreate.js:36`).

Three distinct failures follow from that:

1. **Spacing.** `airhorn.ogg` does not match the query `air horn`. No AI is needed here —
   the substring test simply breaks on the space.
2. **Speech content.** A clip is often memorable for what is _said_ in it, and that text
   exists nowhere in the index.
3. **Non-speech content.** A clip is often memorable for what it _is_ — an air horn, a
   record scratch, a sad trombone — and that description exists nowhere either.

## Non-goals

- Tag editing UI. Tags are generated, not curated, in this iteration.
- Filtering the grid by sound kind. The column is stored, the filter is not built.
- Any change to playback, transcode, or trim paths.

## Why not "transcribe everything"

The obvious implementation — run Whisper over every clip, index the text — is actively
harmful on a soundboard. Whisper is a speech model with no way to report the absence of
speech. Given a 1.5 second air horn it does not return empty; it returns invented text such
as `"Thank you."` or `"Subtitles by the Amara.org community"`. Those strings enter the index
and match queries at random. A poisoned index is worse than an absent one.

The pipeline below therefore decides what a clip _is_ before deciding how to read it.

## Pipeline

### Stage 1 — classify and describe (every clip, one call)

An audio-input LLM call (`openai` SDK, already a dependency of `packages/utils`; model id
read from `SOUND_CAPTION_MODEL` so a provider rename does not require a deploy) returns
structured JSON:

```json
{
  "kind": "speech" | "sound" | "mixed",
  "caption": "a single loud brassy air horn blast, reggae soundsystem style",
  "tags": ["air horn", "horn", "blast", "loud", "brass"]
}
```

`caption` is one descriptive sentence naming the source and character of the audio. `tags`
are 3–8 short keyword phrases chosen so that lexical search can hit them exactly.

### Stage 2 — branch on `kind`

| `kind`   | Action                                                             | Calls |
| -------- | ------------------------------------------------------------------ | ----- |
| `sound`  | Stop. `transcript` stays `NULL`. Caption and tags carry the entry. | 1     |
| `speech` | Whisper (`verbose_json`) for a verbatim transcript.                | 2     |
| `mixed`  | Whisper as above; caption and transcript both populated.           | 2     |

Whisper runs only where speech is known to exist, which is both cheaper and more accurate
than running it blind: a chat model is adequate at description but a dedicated speech model
is better at literal fidelity, and literal fidelity is exactly what a "he says X" query
needs.

`transcript IS NULL` means _no speech present_. It never means _we tried and got nothing_ —
that distinction matters when reasoning about a row later.

The hallucination guard survives as a trim rather than a defense: segments with
`no_speech_prob > 0.6` or `avg_logprob < -1.0` are dropped from the Whisper result, along
with a small blacklist of known hallucination strings.

Misclassification is recoverable. The backfill sweep accepts `force`, bypassing the
`source_size` skip, so a clip wrongly called `sound` is repaired by re-running rather than
by deleting rows.

## Storage

A new table in `initializeSchema()` in `packages/utils/src/database.ts`, following the
raw-SQL convention already used by `sound_customizations` rather than the drizzle schema:

```sql
CREATE TABLE IF NOT EXISTS sound_analysis (
  sound_name   TEXT PRIMARY KEY,
  kind         TEXT NOT NULL,          -- speech | sound | mixed
  transcript   TEXT,                   -- NULL when no speech present
  caption      TEXT NOT NULL,
  tags         TEXT[] NOT NULL DEFAULT '{}',
  search_doc   TEXT NOT NULL,          -- normalized display name + filename + transcript + caption + tags
  search_tsv   tsvector,
  embedding    vector(1536),           -- NULL when pgvector is unavailable
  source_size  BIGINT,                 -- re-analyze when the stored object changes
  model        TEXT NOT NULL,
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);
```

Indexes: GIN on `search_tsv`, `pg_trgm` GIN on `search_doc` for typo tolerance, and an
ivfflat index on `embedding` when pgvector is present.

**Graceful degradation.** `CREATE EXTENSION IF NOT EXISTS vector` is attempted inside a
try. On failure a `vectorAvailable` flag goes false, embeddings are stored as `real[]` and
cosine is computed in JS. At this library size that path is perfectly serviceable. Search
remains fully functional lexically even with embeddings disabled entirely, which matters
because Postgres is optional in this repo.

## Search

One function in `packages/utils/src/sounds/soundSearch.ts`, two callers.

**Normalization.** Query and `search_doc` are both stripped of non-alphanumeric characters
for the lexical pass, so `airhorn` == `air horn` == `Air-Horn`. This is deterministic, free,
and resolves failure (1) on its own.

**Ranking.** Reciprocal Rank Fusion, `score = Σ 1/(60 + rank)`, over two result lists —
lexical (tsquery + trigram) and vector (cosine). RRF rather than a weighted blend because
lexical scores and cosine distances are not on comparable scales, and blending them is where
hybrid search usually goes quietly wrong. An exact filename prefix match is pinned above the
fused list.

Each result carries `matchedOn: 'name' | 'transcript' | 'caption' | 'semantic'` so the
caller can explain itself.

## Surfaces

**`GET /api/sounds/search?q=`** — new route in `apps/raincloud/server/routes/api.ts`,
`requireAuth` like its neighbours, Swagger updated per repo convention.

**Dashboard.** `SoundboardTab` calls the endpoint debounced at ~200ms, retaining the current
instant client-side filter as the pre-response state so typing never feels laggy. Sound cards
render a snippet — transcript when the match was speech, caption when it was semantic — so a
semantic hit is explicable rather than mysterious.

**Discord.** The `/play` autocomplete at `interactionCreate.js:22-80` calls the same search.
Choice labels become `name — snippet`, truncated to Discord's 100-character limit.

Autocomplete fires on every keystroke against a 3 second budget, so it is lexical-first: an
embedding call is spent only when the query is at least 4 characters _and_ the lexical pass
returned fewer than 5 hits, with an LRU cache keyed on the query string. Normal typing
therefore costs nothing, and semantic rescue engages exactly when literal matching has
already failed.

## Jobs

**On upload.** `POST /api/sounds` fires the analysis after the existing transcode step —
transcode rewrites the object, so analyzing first would read bytes that are about to be
replaced. Fire-and-forget, leaving upload latency unchanged.

**Backfill.** `POST /api/sounds/analyze-sweep`, admin-only, mirroring the existing
`transcode-sweep` in structure: concurrency 3, skips rows whose `source_size` is unchanged
unless `force` is set, returns counts. Triggered from `AdminTab`.

## Testing

- RRF ordering and exact-prefix pinning in `soundSearch`.
- Stage 2 routing: each `kind` produces the expected call pattern and the expected
  null/non-null shape of `transcript`.
- Hallucination trim against canned `verbose_json` fixtures.
- Normalization: `air horn` finds `airhorn.ogg`.
- Sweep idempotency, and that `force` overrides the `source_size` skip.
- Route tests for `/api/sounds/search` under `apps/raincloud/server/routes/__tests__/`.
- Lexical-only correctness with `vectorAvailable` false.

External audio and embedding calls are stubbed throughout; no test spends API budget.

## Cost

Analysis is once per clip, at upload or during backfill — one call for an effect, two for
speech. A library of a few hundred short clips backfills for well under a dollar. Search
itself never touches the audio model; it spends one small text-embedding call per settled
dashboard query, and under the conditional rule, rarely anything in Discord.
