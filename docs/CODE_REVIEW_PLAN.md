# Code Review Action Plan

This plan turns the issues in `docs/CODE_REVIEW.md` into actionable workstreams.

## 1) Critical security fixes (immediate)

- [x] Enforce required session secrets in production and fail fast if missing.
  - `server/index.ts:48`
  - `apps/raincloud/server/index.ts:87`

## 2) High severity security fixes (next)

- [x] Remove or gate debug auth endpoints to non-production.
  - `server/routes/auth.ts:450`
  - `apps/raincloud/server/routes/auth.ts:476`
- [x] Add OAuth CSRF protection (`state` or equivalent).
  - `server/routes/auth.ts:40`
  - `apps/raincloud/server/routes/auth.ts:41`
- [x] Fix reflected XSS in auth error pages (escape/DOM-safe render).
  - `server/routes/auth.ts:386`
  - `apps/raincloud/server/routes/auth.ts:411`
- [x] Require auth for status/guild and sound endpoints.
  - `server/routes/api/status.ts:1`
  - `server/routes/api/sounds.ts:20`
  - `apps/raincloud/server/routes/api.ts:140`
  - `apps/raincloud/server/routes/api.ts:356`
- [x] Fix Discord avatar fallback when `discriminator` is missing.
  - `server/routes/auth.ts:268`
  - `apps/raincloud/server/routes/auth.ts:307`

## 3) High severity correctness/build fixes

- [x] Merge duplicate `no-restricted-imports` rules.
  - `eslint.config.js:70`, `eslint.config.js:90`
- [x] Remove unused import causing TS error.
  - `server/index.ts:11`
- [x] Fix stats routes/services compile/runtime breaks.
  - Missing service methods: `server/routes/stats/stats.ts:196`, `server/routes/stats/statsService.ts:26`
  - Bad imports: `server/routes/stats/statsService.ts:1`, `server/routes/stats/statsService.ts:2`
  - Bad validators import: `server/routes/stats/stats.ts:7`
  - Missing listeningHistory module path: `server/routes/stats/stats.ts:156`

## 4) Medium security fixes

- [x] Prevent host-header open redirect after auth.
  - `server/routes/auth.ts:168`
  - `apps/raincloud/server/routes/auth.ts:179`
- [x] Fix DOM XSS in dashboard toast rendering.
  - `public/app.js:57`
- [x] Escape `sound.name` for data attributes.
  - `public/app.js:172`
- [x] Add worker endpoint auth (`WORKER_SECRET`) across apps.
  - `apps/rainbot/src/index.ts:228`
  - `apps/pranjeet/src/index.ts:226`
  - `apps/hungerbot/src/index.ts:153`
- [x] Fix cross-site cookie/CORS settings when UI is hosted on a different domain.
  - `server/index.ts:187`

## 5) Medium correctness and stability

- [x] Fix stats test file (`c;` only).
  - `server/routes/__tests__/stats.test.ts:1`
- [x] Guard `parseLimit` against NaN.
  - `server/routes/stats/validators.ts:19`
- [x] Fix `IS NOT NULL` query condition builder.
  - `server/routes/stats/statsService.ts:401`
- [x] Fix stats/listening history schema creation.
  - `utils/listeningHistory.ts:46`
  - `utils/database.ts:74`
- [x] Fix sound preview MIME mismatch (transcoded OGG).
  - `server/routes/api/sounds.ts:92`, `utils/storage.ts:391`
  - `apps/raincloud/server/routes/api.ts:160`, `utils/storage.ts:391`
- [x] Persist `listeners_at_end`.
  - `utils/statistics.ts:613`
- [x] Fix `getOrchestratorBaseUrl` port handling with paths.
  - `packages/worker-shared/src/orchestrator.ts:9`
- [x] Reset UI progress timer on track change.
  - `ui/src/components/NowPlayingCard.tsx:8`
- [x] Remove double-escaping in UI `escapeHtml` usage.
  - `ui/src/components/soundboard/SoundCard.tsx:44`
  - `ui/src/lib/utils.ts:3`
- [x] Fix missing local module paths in `voiceSessionManager.js`.
  - `commands/voice/voiceSessionManager.js:7`

## 6) Medium operational and performance

- [x] Replace Husky `prepare` with cross-platform script.
  - `package.json:37`
- [x] Remove extra lockfile to prevent drift (no package-lock.json present).
  - `package-lock.json`, `yarn.lock`
- [x] Stop defaulting UI API base URL to production.
  - `ui/src/lib/api.ts:6`
- [x] Gate noisy UI logging to dev.
  - `ui/src/lib/api.ts:46`
  - `ui/src/stores/authStore.ts:29`
  - `ui/src/App.tsx:22`
- [x] Require explicit `REDIS_URL` in production.
  - `packages/redis-client/src/client.ts:8`
- [x] Reduce memory risk for sound uploads.
  - `server/routes/api/sounds.ts:31`
- [x] Guard missing volume before `setVolume`.
  - `utils/voice/voiceInteractionManager.ts:250`
  - `utils/voice/voiceCommandParser.ts:70`
- [x] Decouple voice playback utils from app-specific `getClient`.
  - `utils/voice/playbackManager.ts:14`
- [x] Default voice recording to opt-in.
  - `utils/voice/voiceInteractionManager.ts:28`
- [x] Fix voice channel DM fallback.
  - `apps/raincloud/src/events/voiceStateUpdate.js:126`
- [x] Await async `skip` handler.
  - `apps/raincloud/src/events/buttonInteraction.js:251`
- [x] Namespace RequestCache keys by endpoint/action.
  - `apps/rainbot/src/index.ts:251`
  - `packages/worker-protocol/src/server.ts:40`, `packages/worker-protocol/src/server.ts:62`
  - `apps/pranjeet/src/index.ts:240`
  - `apps/hungerbot/src/index.ts:158`
- [x] Guard `ORCHESTRATOR_BOT_ID` before use.
  - `apps/rainbot/src/index.ts:740`
  - `apps/pranjeet/src/index.ts:284`
  - `apps/hungerbot/src/index.ts:309`
- [x] Fix `playNext` recursion without await.
  - `apps/rainbot/src/index.ts:221`
- [x] Gate voice capture enablement in pranjeet by env/feature flag.
  - `apps/pranjeet/src/index.ts:258`
- [x] Remove duplicate Drizzle migration for `listening_history`.
  - `packages/db/drizzle/0000_listening_history.sql`
  - `packages/db/drizzle/0001_sleepy_felicia_hardy.sql`
- [x] Remove compiled artifacts from `packages/redis-client/src`.
  - `packages/redis-client/src/client.js`
  - `packages/redis-client/src/client.js.map`
  - `packages/redis-client/src/client.d.ts`

## 7) Low severity cleanup and docs

- [x] Replace garbled log prefixes with ASCII.
  - `server/middleware/requestLogger.ts:23`
  - `server/index.ts:50`
  - `utils/config.ts:212`
- [x] Align `LeaveResult`/`StopResult` exports with docs/comments.
  - `packages/protocol/src/commands/index.ts:1`
  - `packages/protocol/src/types/commands.ts:46`
- [x] Replace emoji-heavy logs in voice modules (Windows safety).
  - `utils/voice/playbackManager.ts:49`
  - `utils/voice/voiceInteractionManager.ts:120`
- [x] Add backpressure/limits to in-memory stats buffer.
  - `utils/statistics.ts:1`
- [x] Ensure TS event registration/compilation for handlers.
  - `apps/raincloud/handlers/eventHandler.js:9`
- [x] Fix Swagger cookie name mismatch.
  - `server/swagger.ts:92`
  - `server/index.ts:178`
- [x] Add pitch/speakingRate to TTS cache key.
  - `utils/voice/textToSpeech.ts:200`
- [x] Fix components README import path example.
  - `components/README.md:78`
- [x] Fix docs reference to missing integration guide.
  - `docs/DEPLOYMENT.md:589`
