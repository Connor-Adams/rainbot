# Copilot instructions for Rainbot

This file gives AI coding agents focused, actionable information to be immediately productive in this repository.

## Big picture (quick)

- **Runtime**: Node.js 22.12.0+ app (root) that runs the Discord bot and an Express-based web dashboard. Frontend lives in `ui/` (Vite + React).
- **Entrypoints**: `index.js` (bot + dashboard), `deploy-commands.js` (deploy slash commands), `server/index.ts` (Express API).
- **Voice subsystem**: Modular TypeScript code under `utils/voice/` (audioResource, queueManager, playbackManager, soundboardManager, snapshotManager). Treat that as the authoritative playback API.
- **Architecture**: Mixed JS/TS codebase — bot commands and events are CommonJS JavaScript, server and utilities are TypeScript. See `ARCHITECTURE.md` for detailed design decisions.

## Key directories & examples

- `commands/` — Discord slash commands organized by category. Add new commands as `commands/<category>/<name>.js` exporting `data` (SlashCommandBuilder) and `execute(interaction)` function. **Example**: [commands/voice/play.js](commands/voice/play.js).
- `events/` — Discord event handlers (ready, interactionCreate, voiceStateUpdate, etc.) wired at startup in `index.js`.
- `utils/` — Shared utilities: logger (Winston), config, database (PostgreSQL), statistics, storage (S3/local). **Voice orchestration**: See [utils/voice/README.md](utils/voice/README.md) for concurrency patterns and design.
- `server/` — Express API with TypeScript: routes, middleware (auth, requestLogger), Swagger docs. Main entry: [server/index.ts](server/index.ts).
- `ui/` — React dashboard (Vite build). Run `npm run dev:ui` for development, `npm run build:ui` to build production assets.
- `types/` — TypeScript type definitions for the entire project (commands.ts, voice.ts, server.ts, di.symbols.ts).

## Build & developer workflows (must-use commands)

- **Install**: `npm install` (root) — installs both backend and prepares frontend. UI is built separately via `npm run build:ui`.
- **Compile TS**: `npm run build:ts` — compiles all TypeScript files to `dist/`.
- **Start bot + dashboard**: `npm run start` — compiles TS (via `build:ts`), then runs `node index.js`. For production with UI: `npm run build` (builds UI, then starts).
- **Development**:
  - Backend/bot: `node index.js` after setting `.env` (requires `npm run build:ts` first if TS changed).
  - Frontend only: `npm run dev:ui` (runs dev server on separate port).
- **Deploy commands**: `node deploy-commands.js` (optional — the bot auto-deploys slash commands on startup).
- **Quality checks**: 
  - `npm run lint` / `npm run lint:fix` — ESLint with Prettier.
  - `npm run format` / `npm run format:check` — Prettier formatting.
  - `npm run type-check` — TypeScript type checking (`tsc --noEmit`).
  - `npm run test` — Jest unit tests (supports both JS and TS via ts-jest).
  - `npm run validate` — runs all checks (type-check, lint, format:check, test).

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
- `inversify` is used in some server modules ([utils/di-container.ts](utils/di-container.ts), `server/`).
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
- **Required**: `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `SESSION_SECRET`.
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

- **Unit tests**: `npm run test` — Jest with ts-jest for TypeScript files.
- **Test organization**: Place tests in `__tests__/` subdirectories (e.g., [utils/voice/__tests__/](utils/voice/__tests__/), [server/routes/__tests__/](server/routes/__tests__/)).
- **Coverage**: `npm run test:coverage` — generates coverage reports.
- **Static checks**: `npm run type-check`, `npm run lint`, `npm run format:check`.
- **Pre-commit hooks**: Husky + lint-staged runs linting and formatting on staged files.

## Typical code change checklist (for PRs / agents)

1. **Run static checks**: `npm run type-check` and `npm run lint` locally (or ensure CI passes).
2. **Voice behavior changes**: 
   - Add unit tests around `utils/voice/*`.
   - Ensure use of `withQueueLock` for queue mutations.
   - Update [utils/voice/README.md](utils/voice/README.md) if design changes.
3. **Adding commands**: 
   - Place file in `commands/<category>/`.
   - Follow `data` + `execute` shape (see existing commands).
   - Commands auto-deploy on bot startup (or run `node deploy-commands.js` manually).
4. **Server/API changes**: 
   - Update Swagger docs in [server/swagger.ts](server/swagger.ts).
   - Add integration tests in `server/routes/__tests__/`.
5. **Update docs**: README or ARCHITECTURE.md for significant design changes.

## Where to look for examples

- **Playback flow**: [utils/voice/playbackManager.ts](utils/voice/playbackManager.ts), [queueManager.ts](utils/voice/queueManager.ts), [audioResource.ts](utils/voice/audioResource.ts).
- **Command examples**: [commands/voice/play.js](commands/voice/play.js), [commands/voice/join.js](commands/voice/join.js), [commands/utility/ping.js](commands/utility/ping.js).
- **Server API**: [server/routes/api.ts](server/routes/api.ts), [server/index.ts](server/index.ts), [server/middleware/auth.ts](server/middleware/auth.ts).
- **Database queries**: [utils/database.ts](utils/database.ts), [utils/statistics.ts](utils/statistics.ts).
- **Testing patterns**: [utils/voice/__tests__/](utils/voice/__tests__/), [server/routes/__tests__/](server/routes/__tests__/).

## When in doubt

- Prefer reusing existing helpers in `utils/` and follow the voice module APIs.
- Avoid changing module format across files (CommonJS vs ES modules) without updating build & startup paths.
- Check [ARCHITECTURE.md](ARCHITECTURE.md) for design decisions and rationale.
- For voice-related work, always read [utils/voice/README.md](utils/voice/README.md) first — it documents critical concurrency patterns.
