# Copilot instructions for Rainbot

This file gives AI coding agents focused, actionable information to be immediately productive in this repository.

## Big picture (quick)

- **Runtime**: Node.js 22.12.0+ monorepo (yarn workspaces). Orchestrator: `apps/raincloud` (API + Discord). Workers: `apps/rainbot`, `apps/pranjeet`, `apps/hungerbot`. Dashboard: `ui/` (Vite + React, deploy separately).
- **Entrypoints**: `apps/raincloud/index.js` (orchestrator), `apps/raincloud/server/` (Express API only, no UI). `deploy-commands.js` for slash commands.
- **Voice subsystem**: Modular TypeScript code under `utils/voice/` (audioResource, queueManager, playbackManager, soundboardManager, snapshotManager). Treat that as the authoritative playback API.
- **Architecture**: Mixed JS/TS; bot commands and events are CommonJS, server and utilities are TypeScript. See `docs/MULTIBOT_ARCHITECTURE.md`.

## Key directories & examples

- `apps/raincloud/commands/` — Orchestrator slash commands (voice/play.js, etc.). Export `data` (SlashCommandBuilder) and `execute(interaction)`.
- `apps/raincloud/handlers/`, `apps/raincloud/src/events/` — Discord event handlers wired in raincloud.
- `utils/` — Shared utilities: logger, config, database, statistics, storage. **Voice**: [utils/voice/README.md](utils/voice/README.md).
- `apps/raincloud/server/` — Express API (TypeScript): routes, auth, Swagger. Main: [apps/raincloud/server/index.ts](apps/raincloud/server/index.ts). API-only (no UI serving).
- `ui/` — React dashboard. Dev: `yarn workspace @rainbot/ui dev`. Build: `yarn build:ui`. Deploy separately (see ui/railway.json).
- `types/` — TypeScript types (root and apps/raincloud/types).

## Build & developer workflows (must-use commands)

- **Install**: `yarn` (root) — workspaces. UI build: `yarn build:ui` when needed for UI deployment.
- **Compile TS**: `yarn build` or `yarn build:ts` — turbo builds.
- **Start**: `yarn dev` (turbo — all apps) or `yarn workspace @rainbot/raincloud dev` (orchestrator only).
- **Development**:
  - Orchestrator: `yarn workspace @rainbot/raincloud dev` (from root; ensure `.env` and `yarn build` if TS changed).
  - UI only: `yarn workspace @rainbot/ui dev`.
- **Deploy commands**: `node deploy-commands.js` (optional — bot can auto-deploy).
- **Quality checks**:
  - `yarn lint` / `yarn lint:fix` — ESLint.
  - `yarn format` / `yarn format:check` — Prettier.
  - `yarn type-check` — TypeScript.
  - `yarn test` — Jest.
  - `yarn validate` — type-check, lint, format:check, test.

## Project-specific conventions & patterns

### Module format & compilation

- **Mixed JS/TS**: Bot commands and events are CommonJS JavaScript; server code and utils are TypeScript. Type-checking uses `tsc` (`npm run type-check`).
- **Imports**: CommonJS uses `require()`, TypeScript uses ES imports. Compiled TS outputs to `dist/` and is imported via `require('./dist/...')` from JS files.
- **Be conservative** when changing module formats — ensure build & startup paths are updated.

### Voice concurrency (CRITICAL)

- **Always use `queueManager.withQueueLock(guildId, fn)`** for any code that mutates playback queues. Race conditions are a frequent source of bugs.
- Example from [utils/voice/queueManager.ts](utils/voice/queueManager.ts):
  ```typescript
  return withQueueLock(guildId, () => {
    const state = getVoiceState(guildId);
    state.queue.push(...tracks);
  });
  ```
- See [utils/voice/README.md](utils/voice/README.md) for full concurrency patterns and mutex usage.

### Dependency Injection

- `inversify` is used in some raincloud modules ([apps/raincloud/src/di/di-container.ts](apps/raincloud/src/di/di-container.ts)).
- Prefer passing dependencies explicitly rather than importing globals for new services.
- Custom DI container available for simple singleton management.

### Audio resources

- Use helper functions in [utils/voice/audioResource.ts](utils/voice/audioResource.ts) for streaming (fast fetch-based with fallbacks).
- Don't reimplement streaming logic — `createTrackResourceForAny()` handles YouTube, SoundCloud, Spotify, and local files.

### Command shape (Discord slash commands)

- Export object with `data` (SlashCommandBuilder) and `execute(interaction)` function.
- Example from [commands/voice/play.js](commands/voice/play.js):
  ```javascript
  module.exports = {
    data: new SlashCommandBuilder()
      .setName('play')
      .setDescription('Play a sound file or URL')
      .addStringOption(...),
    async execute(interaction) { ... }
  };
  ```

### Logging

- Use `createLogger(moduleName)` from [utils/logger.ts](utils/logger.ts) — Winston-based with levels (error, warn, info, debug).
- All modules should create their own logger: `const log = createLogger('MYMODULE');`

## Integration points & external requirements

### Environment variables

- `.env` for local development (see `.env.example`). Production uses platform env vars (Railway).
- **Required**: `DISCORD_BOT_TOKEN` (Raincloud), `DISCORD_CLIENT_ID`, session secret; workers: `RAINCLOUD_URL`, `WORKER_SECRET`, etc.
- **Optional**: Database (PostgreSQL), Redis (sessions), S3 (storage), Spotify credentials.
- See [config.example.json](config.example.json) and [OAUTH_SETUP.md](OAUTH_SETUP.md) for full config.

### External services

- **PostgreSQL** (`pg`): Statistics tracking, listening history.
- **Redis** (optional): Session store for dashboard. Falls back to file-based sessions if unavailable.
- **AWS S3**: Sound file storage (S3 client initialized in [utils/storage.ts](utils/storage.ts)).
- **FFmpeg**: Required on host for audio processing. Install via package manager.
- **Spotify**: Optional `play-dl` integration for Spotify links (requires client ID/secret).

### Native dependencies

- Audio libs: `@discordjs/opus`, `opusscript`, FFmpeg binary.
- Ensure FFmpeg is installed on CI/dev machine before running.

## Tests & verification

- **Unit tests**: `yarn test` — Jest (ts-jest for TS).
- **Test organization**: `__tests__/` next to code (e.g. utils/voice/**tests**/, apps/raincloud/server/routes/**tests**/).
- **Coverage**: `yarn test:coverage`.
- **Static checks**: `yarn type-check`, `yarn lint`, `yarn format:check`.
- **Pre-commit hooks**: Husky + lint-staged runs linting and formatting on staged files.

## Typical code change checklist (for PRs / agents)

1. **Run static checks**: `yarn type-check` and `yarn lint` (or rely on CI).
2. **Voice behavior changes**:
   - Add tests under `utils/voice/__tests__/`.
   - Use `withQueueLock` for queue mutations.
   - Update [utils/voice/README.md](utils/voice/README.md) if design changes.
3. **Adding commands**:
   - Place in `apps/raincloud/commands/<category>/`.
   - Export `data` (SlashCommandBuilder) and `execute(interaction)`.
   - Commands can auto-deploy on startup or via `node deploy-commands.js`.
4. **Server/API changes**:
   - Update Swagger in [apps/raincloud/server/swagger.ts](apps/raincloud/server/swagger.ts).
   - Add tests in `apps/raincloud/server/routes/__tests__/`.
5. **Update docs**: README or docs/ for significant changes.

## Where to look for examples

- **Playback flow**: [utils/voice/playbackManager.ts](utils/voice/playbackManager.ts), [queueManager.ts](utils/voice/queueManager.ts), [audioResource.ts](utils/voice/audioResource.ts).
- **Command examples**: [commands/voice/play.js](commands/voice/play.js), [commands/voice/join.js](commands/voice/join.js), [commands/utility/ping.js](commands/utility/ping.js).
- **Server API**: [apps/raincloud/server/routes/api.ts](apps/raincloud/server/routes/api.ts), [apps/raincloud/server/index.ts](apps/raincloud/server/index.ts), [apps/raincloud/server/middleware/auth.ts](apps/raincloud/server/middleware/auth.ts).
- **Database queries**: [utils/database.ts](utils/database.ts), [utils/statistics.ts](utils/statistics.ts).
- **Testing patterns**: [utils/voice/**tests**/](utils/voice/__tests__/), [apps/raincloud/server/routes/**tests**/](apps/raincloud/server/routes/__tests__/).

## When in doubt

- Prefer reusing existing helpers in `utils/` and follow the voice module APIs.
- Avoid changing module format across files (CommonJS vs ES modules) without updating build & startup paths.
- Check [docs/MULTIBOT_ARCHITECTURE.md](docs/MULTIBOT_ARCHITECTURE.md) for design and rationale.
- For voice-related work, always read [utils/voice/README.md](utils/voice/README.md) first — it documents critical concurrency patterns.
