# Copilot instructions for Rainbot

This file gives AI coding agents focused, actionable information to be immediately productive in this repository.

## Big picture (quick)
- Runtime: Node.js app (root) that runs the Discord bot and an Express-based web dashboard. Frontend lives in `ui/` (Vite + React).
- Entrypoints: `index.js` (bot + dashboard), `deploy-commands.js` (deploy slash commands), `server/index.ts` (Express API).
- Voice subsystem: modular code under `utils/voice/` (audioResource, queueManager, playbackManager, soundboardManager, snapshotManager). Treat that as the authoritative playback API.

## Key directories & examples
- `commands/` — Discord slash commands. Add new commands as `commands/<category>/<name>.js` exporting `data` and `execute`. Example: `commands/voice/play.js`.
- `events/` — Discord event handlers wired at startup.
- `utils/` — shared utilities (logger, config, voice orchestration). See `utils/voice/README.md` for design and concurrency notes.
- `server/` — Express API, middleware and routes for dashboard. See `server/index.ts` and `server/routes/`.
- `ui/` — React dashboard app. Use `npm run dev:ui` to run locally and `npm run build:ui` to build.

## Build & developer workflows (must-use commands)
- Install: `npm install` (root) — front-end `ui/` is built by `npm run build:ui` which runs `cd ui && npm install && npm run build`.
- Compile TS: `npm run build:ts` (compiles TypeScript files in repo).
- Start bot + dashboard: `npm run start` (runs `build:ui` then `start` which compiles TS then `node index.js`). For development, run `node index.js` after setting `.env` or `npm run dev:ui` for front-end alone.
- Deploy commands: `node deploy-commands.js` (optional — the bot auto-deploys on startup).
- Lint/format/type/test: `npm run lint`, `npm run format`, `npm run type-check`, `npm run test`.

## Project-specific conventions & patterns
- Mixed JS/TS: Root bot and commands are CommonJS JavaScript; server code is TypeScript under `server/`. Type-checking uses `tsc` (`npm run type-check`). Be conservative when changing module formats.
- Dependency Injection: `inversify` is used in some server modules (`utils/di-container.ts`, `server/`). Prefer passing dependencies rather than importing globals for new services.
- Voice concurrency: Use `queueManager.withQueueLock(guildId, fn)` for any code that mutates playback queues. Race conditions are a frequent source of bugs — follow `utils/voice/README.md` patterns.
- Audio resources: Use helper functions in `utils/voice/audioResource.js` (fast fetch-based streaming with fallbacks) instead of reimplementing streaming logic.
- Command shape: Command files export an object with `data` (SlashCommandBuilder-like) and `execute(interaction)` function — follow existing files in `commands/`.

## Integration points & external requirements
- Environment: `.env` or platform env vars. See `config.example.json` and `OAUTH_SETUP.md`. Required: `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `SESSION_SECRET`, DB and OAuth vars for dashboard features.
- External services: PostgreSQL (`pg`) for statistics, Redis optional for sessions, AWS S3 client present for storage, FFmpeg required on host for audio processing, optional Spotify credentials for Spotify links.
- Native dependencies: audio libs (`@discordjs/opus`, `opusscript`, ffmpeg). Ensure FFmpeg installed on CI/dev machine.

## Tests & verification
- Unit tests: `npm run test`. Many core modules are JS — ensure `ts-jest` config if adding TypeScript tests for `server/`.
- Static checks: `npm run type-check`, `npm run lint`, `npm run format:check`.

## Typical code change checklist (for PRs / agents)
1. Run `npm run type-check` and `npm run lint` locally (or ensure CI passes).
2. If changing voice behavior: add unit tests around `utils/voice/*` and ensure use of `withQueueLock` where appropriate.
3. If adding commands: place file in `commands/`, follow `data` + `execute` shape, and either start the bot or run `node deploy-commands.js`.
4. Update docs/README or `utils/voice/README.md` when design changes.

## Where to look for examples
- Playback flow: `utils/voice/playbackManager.js`, `queueManager.js`, `audioResource.js`.
- Command examples: `commands/voice/play.js`, `commands/voice/join.js`, `commands/utility/ping.js`.
- Server API: `server/routes/api.ts`, `server/index.ts`.

## When in doubt
- Prefer reusing existing helpers in `utils/` and follow the voice module APIs.
- Avoid changing module format across files (CommonJS vs ES modules) without updating build & startup paths.

---
If you'd like, I can iterate this file to include more explicit code snippets (e.g., a template for a new command file) or merge content from any other agent docs you prefer. Feedback?
