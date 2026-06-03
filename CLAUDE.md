# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Multi-bot Discord voice system (4 bots) + a React dashboard, in a Yarn 4 / Turbo monorepo. Node ≥ 22.12.

> **Stale guidance warning:** `.github/copilot-instructions.md` and `.cursor/rules/*.mdc` predate the monorepo migration. They reference root `utils/`, `utils/voice/`, root `commands/`, and a root `yarn lint` script — **all wrong now**. Shared code moved to `packages/`; there is no root lint script. Trust this file and `README.md` over those.

## Commands

Run from the repo root unless noted. `validate` is the definition of done.

```bash
yarn                       # install (Yarn 4.6 workspaces)
yarn dev                   # turbo: run ALL bots + UI (persistent)
yarn workspace @rainbot/raincloud dev   # one bot (builds TS, then node index.js)
yarn workspace @rainbot/ui dev          # UI only (Vite, HMR on :5173)

yarn build                 # turbo build all → dist/
yarn build:ts              # TypeScript compile only
yarn type-check            # turbo tsc --noEmit
yarn test                  # turbo jest (depends on build:ts)
yarn format / format:check # prettier via turbo
yarn validate              # type-check && format:check && test  ← gate before done

yarn db:generate / db:migrate   # drizzle-kit (schema: packages/db/src/schema/index.ts)
```

**Lint has no root script.** It is per-workspace and runs on commit (husky + lint-staged):
`yarn workspace @rainbot/raincloud lint`, `yarn workspace @rainbot/ui lint`.

**Single package / single test:** `yarn test` (turbo) builds deps first. Invoking one workspace's
tests directly does **not** — run `yarn build:ts` first, since tests import `@rainbot/*` from `dist/`.

```bash
yarn build:ts
yarn workspace @rainbot/utils test                       # one package
yarn workspace @rainbot/utils test src/voice/__tests__/queueManager.test.ts   # one file
yarn workspace @rainbot/utils test -t "withQueueLock"    # by test name
```

Bots have **no hot reload** — after editing `.ts`, rebuild (`yarn build:ts`) before re-running. UI has Vite HMR.

## Architecture: orchestrator + 3 workers

See [docs/MULTIBOT_ARCHITECTURE.md](docs/MULTIBOT_ARCHITECTURE.md) for the full design, Redis key schema, and tRPC procedure list.

| Bot           | Workspace                                      | Role                                                                                                               |
| ------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| **Raincloud** | `@rainbot/raincloud` (`apps/raincloud`)        | Orchestrator: receives all slash commands, serves the dashboard API, owns voice/session state, coordinates workers |
| **Rainbot**   | `@rainbot/rainbot-worker` (`apps/rainbot`)     | Music playback (YouTube/SoundCloud/Spotify, queue, autoplay)                                                       |
| **Pranjeet**  | `@rainbot/pranjeet-worker` (`apps/pranjeet`)   | TTS + Grok voice conversation (`/chat` mode)                                                                       |
| **Hungerbot** | `@rainbot/hungerbot-worker` (`apps/hungerbot`) | Soundboard effects                                                                                                 |

- **Control plane is tRPC** (`@rainbot/rpc`, mounted at `/trpc`): Raincloud calls workers for `join`/`leave`/`volume`/`enqueue`/`speak`/`playSound`/etc. Workers implement routers via `createRainbotRouter` / `createPranjeetRouter` / `createHungerbotRouter`. **HTTP is health-only** (`/health/live`, `/health/ready`); workers also call back to Raincloud over HTTP at `/internal/...` to register and report stats.
- **Shared secret:** `WORKER_SECRET` (sent as `x-internal-secret` / `x-worker-secret`) must match on Raincloud and every worker. Mutations carry a `requestId`; workers cache responses 60s for idempotency.
- **State lives in Redis** (`@rainbot/redis-client`): voice channel, per-guild session (30min TTL), worker status, volume, conversation mode, Grok thread continuity. Postgres (`@rainbot/db`) is optional, for stats / listening history.
- **The UI deploys separately** (`ui/railway.json`) and talks to Raincloud over HTTP; it is not served by any bot.

## Workspace dependency rules (ESLint-enforced)

Direction is strict and enforced by `no-restricted-imports` in [eslint.config.js](eslint.config.js):

- **apps → packages only.** An app may not import another app (`../apps/*` is banned), and packages may not import apps.
- **Never import by bare path.** `utils/*`, `commands/*`, `types/*`, `components/*`, `events/*`, `handlers/*` are all banned imports. Use the `@rainbot/*` package name or a path alias.

Build order (leaves first): `protocol` → `shared` / `worker-protocol` / `db` / `redis-client` → `rpc` / `worker-shared` → `utils`. `tsconfig.json` resolves `@rainbot/protocol` and `@rainbot/utils` from their **`dist/` .d.ts** (so they must be built before type-check resolves them) but `@rainbot/db` from source — this is why Turbo's `type-check` and `test` tasks `dependsOn` build.

| Package                    | Role                                                                                                   |
| -------------------------- | ------------------------------------------------------------------------------------------------------ |
| `@rainbot/protocol`        | Base shared commands/events/types/errors (no deps; built to dist, consumed widely)                     |
| `@rainbot/shared`          | Shared helpers — dual CJS+ESM build (`tsconfig.esm.json`) because the ESM UI consumes it               |
| `@rainbot/worker-protocol` | Orchestrator↔worker message contracts                                                                  |
| `@rainbot/worker-shared`   | Worker app factories (`createWorkerExpressApp`, etc.)                                                  |
| `@rainbot/rpc`             | tRPC routers + clients                                                                                 |
| `@rainbot/db`              | Drizzle ORM (schema + migrations in `packages/db/drizzle/`)                                            |
| `@rainbot/redis-client`    | Redis wrapper                                                                                          |
| `@rainbot/utils`           | **Voice subsystem** (`src/voice/`) + `logger`/`config`/`storage`/`statistics`/`database`/`playerEmbed` |

## Module formats & how Raincloud runs (important)

This repo mixes CommonJS and TypeScript, and Raincloud has a runtime alias loader — getting this wrong breaks startup.

- **Raincloud is `type: commonjs`.** `index.js` and `commands/**/*.js` are CommonJS (`require`). `server/`, `handlers/`, `lib/`, `src/events/` are TypeScript compiled to `dist/` and `require`d from the JS.
- **`apps/raincloud/index.js` monkeypatches `Module._resolveFilename`** to map `@server` / `@handlers` / `@events` / `@components` / `@lib` / `@commands` → `dist/apps/raincloud/...`. Consequence: **always run from the repo root, and always build (`yarn build:ts`) before `node index.js`** — these aliases resolve only against compiled `dist/`.
- **Workers** are TypeScript → `dist/`, run via `node dist/index.js`. Pranjeet (like Raincloud) uses `tsc-alias` + a separate `tsconfig.typecheck.json` and emits to a nested `dist/apps/pranjeet/src/` path.
- **UI** is `type: module` (ESM), Vite + React.
- Be conservative changing a file's module format — update build and startup paths together.

## Conventions

- **Voice queue mutations must hold the lock.** Wrap any queue mutation in `withQueueLock(guildId, fn)` (from `@rainbot/utils`, `src/voice/queueManager.ts`). Race conditions here are a recurring bug source. Don't reimplement streaming — `createTrackResourceForAny()` in `src/voice/audioResource.ts` handles all sources.
- **Logging:** `const log = createLogger('MODULE')` from `@rainbot/utils` (Winston).
- **Slash commands** live only in [apps/raincloud/commands/](apps/raincloud/commands/)`<category>/*.js` — the single source of truth for both the runtime loader and [deploy-commands.js](deploy-commands.js). Each exports `{ data: SlashCommandBuilder, async execute(interaction) }`. They auto-deploy on startup, or run `node deploy-commands.js`.
- **API changes:** update Swagger in `apps/raincloud/server/swagger.ts`; add route tests under `apps/raincloud/server/**/__tests__/`.
- **Tests** are colocated in `__tests__/` next to the code (ts-jest).
- `components/` at the repo root is a stale duplicate of `apps/raincloud/components/` (the runtime `@components` alias and Jest both resolve to the latter). Prefer editing `apps/raincloud/components/`.

## Other docs

[RAILWAY_DEPLOY.md](RAILWAY_DEPLOY.md) (prod deploy) · [OAUTH_SETUP.md](OAUTH_SETUP.md) (dashboard login) · [docs/TYPES_CANONICAL.md](docs/TYPES_CANONICAL.md) · [docs/CONVERSATIONAL_GROK_VOICE_FLOW.md](docs/CONVERSATIONAL_GROK_VOICE_FLOW.md) · [docs/YOUTUBE_403_FIX.md](docs/YOUTUBE_403_FIX.md) · [docs/FUTURE_WORK.md](docs/FUTURE_WORK.md) · env vars in [.env.example](.env.example).
