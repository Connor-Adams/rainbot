# Code Review Issues

This file tracks obvious errors and improvement opportunities found during a manual scan.

## Critical

- Session secret falls back to a known default in production, which weakens cookie signing if `SESSION_SECRET` is missing. Consider failing fast in production/Railway when missing. (`server/index.ts:48`)
- Raincloud server also falls back to a known default `SESSION_SECRET` in production, weakening cookie signing if unset. Consider failing fast when missing. (`apps/raincloud/server/index.ts:87`)

## High

- Debug auth endpoint exposes session data and request headers without auth gating. Remove or gate to non-production. (`server/routes/auth.ts:450`)
- Discord avatar fallback assumes `discriminator` exists; for newer users it can be missing, producing a broken URL. Guard and use a safe default. (`server/routes/auth.ts:268`)
- Duplicate `no-restricted-imports` rules for the same glob means earlier restrictions are overwritten. Merge into one rule block. (`eslint.config.js:70`, `eslint.config.js:90`)
- Unused import `getClient` causes a TypeScript error under `noUnusedLocals`. (`server/index.ts:11`)
- Unauthenticated status endpoints expose guild list and connections; likely should require auth. (`server/routes/api/status.ts:1`)
- Unauthenticated sound list/recordings/download endpoints may leak private audio assets. Consider adding `requireAuth` and guild checks. (`server/routes/api/sounds.ts:20`)
- OAuth flow does not use `state`, which reduces CSRF protections for login redirects. Consider enabling `state` or adding a custom nonce check. (`server/routes/auth.ts:40`)
- Auth error page interpolates `error`/`details` query params directly into HTML without escaping, enabling reflected XSS. Escape or render via templating/DOM-safe methods. (`server/routes/auth.ts:386`)
- Raincloud auth debug endpoint exposes session data and request headers without auth gating. Remove or gate to non-production. (`apps/raincloud/server/routes/auth.ts:476`)
- Raincloud OAuth flow does not use `state`, which reduces CSRF protections for login redirects. Consider enabling `state` or adding a custom nonce check. (`apps/raincloud/server/routes/auth.ts:41`)
- Raincloud auth error page interpolates `error`/`details` query params directly into HTML without escaping, enabling reflected XSS. Escape or render via templating/DOM-safe methods. (`apps/raincloud/server/routes/auth.ts:411`)
- Raincloud unauthenticated sound list/recordings/download endpoints may leak private audio assets. Consider adding `requireAuth` and guild checks. (`apps/raincloud/server/routes/api.ts:140`)
- Raincloud unauthenticated status and guild channels endpoints expose guild data; likely should require auth. (`apps/raincloud/server/routes/api.ts:356`)
- Raincloud unauthenticated sound list/recordings/download endpoints may leak private audio assets. Consider adding `requireAuth` and guild checks. (`apps/raincloud/server/routes/api.ts:140`)
- Raincloud unauthenticated status and guild channels endpoints expose guild data; likely should require auth. (`apps/raincloud/server/routes/api.ts:356`)
- Stats routes call service methods that do not exist, which breaks compilation or throws at runtime for multiple endpoints. Either implement or remove the routes. (`server/routes/stats/stats.ts:196`, `server/routes/stats/statsService.ts:26`)
- Stats service imports `../utils/database` and `../utils/queryBuilder`, but those paths don’t exist from `server/routes/stats`. This will fail module resolution. Update to the correct relative paths (likely `../../../utils/database` and `./queryBuilder`). (`server/routes/stats/statsService.ts:1`, `server/routes/stats/statsService.ts:2`)
- Stats routes import validators from `../../utils/validators`, but the validators live in `server/routes/stats/validators.ts`. Fix the import path or move the file. (`server/routes/stats/stats.ts:7`)
- Stats history endpoint requires `../../utils/listeningHistory`, which resolves to a non-existent path; the real module is `utils/listeningHistory.ts`. This will throw when the route is hit. (`server/routes/stats/stats.ts:156`)

## Medium

- Husky `prepare` script uses POSIX shell syntax and fails on Windows. Replace with a cross-platform script. (`package.json:37`)
- Two lockfiles (`package-lock.json`, `yarn.lock`) can drift. Remove the unused one or ignore it. (`package-lock.json`, `yarn.lock`)
- Stats test file contains stray `c;` and no test code, which will fail or break Jest/TS runs. Delete or replace with a real test. (`server/routes/__tests__/stats.test.ts:1`)
- Auth redirect uses `x-forwarded-host`/`host` to build `baseUrl` without allowlisting, enabling host-header injection/open redirect after login/logout. Prefer a configured `APP_URL` or allowlist hosts. (`server/routes/auth.ts:168`)
- Stats `parseLimit` returns `NaN` when limit is non-numeric (e.g., `?limit=abc`), which then feeds into SQL parameterization and can break queries. Fall back to `defaultLimit` when `parseInt` yields `NaN`. (`server/routes/stats/validators.ts:19`)
- Sound preview may send a transcoded OGG stream while setting `Content-Type` based on the original filename extension, causing mismatched MIME types and broken playback. Consider returning the actual filename/extension from storage or sniffing the stream. (`server/routes/api/sounds.ts:92`, `utils/storage.ts:391`)
- Track engagement inserts omit `listeners_at_end`, so the end listener count is tracked in memory but never written to the database. Include it in the insert. (`utils/statistics.ts:613`)
- Raincloud auth redirect uses `x-forwarded-host`/`host` to build `baseUrl` without allowlisting, enabling host-header injection/open redirect after login/logout. Prefer a configured `DASHBOARD_ORIGIN` or allowlist hosts. (`apps/raincloud/server/routes/auth.ts:179`)
- Raincloud sound preview may send a transcoded OGG stream while setting `Content-Type` from the original filename, causing MIME mismatch and broken playback. (`apps/raincloud/server/routes/api.ts:160`, `utils/storage.ts:391`)
- Raincloud sound preview may send a transcoded OGG stream while setting `Content-Type` from the original filename, causing MIME mismatch and broken playback. (`apps/raincloud/server/routes/api.ts:160`, `utils/storage.ts:391`)
- Compiled artifacts checked into `packages/redis-client/src` can go stale and confuse builds; move to `dist` and clean `src`. (`packages/redis-client/src/client.js`, `packages/redis-client/src/client.js.map`, `packages/redis-client/src/client.d.ts`)
- Auth API interceptors log cookies and responses in all builds; gate to dev to avoid noisy logs in prod. (`ui/src/lib/api.ts:46`)
- UI defaults to a hard-coded production API base URL when env is missing, which can cause dev/test clients to hit prod accidentally. (`ui/src/lib/api.ts:6`)
- Cross-site auth may fail if UI is hosted on a different domain because cookies are `sameSite: 'lax'` and there is no CORS config. If UI is on another domain, use `sameSite: 'none'` + `secure` and configure CORS. (`server/index.ts:187`)
- Redis client defaults to `redis://localhost:6379` when `REDIS_URL` is missing; in production this can cause unexpected connection attempts or delays. Consider requiring explicit config. (`packages/redis-client/src/client.ts:8`)
- Sound uploads use in-memory storage with up to 50 files \* 50MB each; a single request can consume large RAM. Consider lowering limits, streaming to disk, or enforcing total size. (`server/routes/api/sounds.ts:31`)
- Voice command volume can be undefined and flow into `setVolume`, resulting in `NaN` volume (no clamp). Guard missing parameter before calling setVolume. (`utils/voice/voiceInteractionManager.ts:250`, `utils/voice/voiceCommandParser.ts:70`)
- Voice playback utilities import `getClient` from `apps/raincloud/server/*`, which ties shared voice code to a specific app and can break other builds. Consider dependency injection or moving the client getter into a shared package. (`utils/voice/playbackManager.ts:14`)
- Voice interaction defaults to recording and uploading user audio (`recordAudio: true`), which may be a privacy/storage risk. Consider defaulting to false or gating by env. (`utils/voice/voiceInteractionManager.ts:28`)
- Listening history uses a table (`listening_history`) that is never created in `initializeSchema`, so inserts can fail silently. Either add schema creation or gate calls when missing. (`utils/listeningHistory.ts:46`, `utils/database.ts:74`)
- Resume prompt DM fallback tries `channel.send` on a voice channel, which will throw (voice channels are not text-based). Check `channel.isTextBased()` or pick a text channel. (`apps/raincloud/src/events/voiceStateUpdate.js:126`)
- Button handler `skip` is async but not awaited, so failures can go unhandled and UI may update before the skip finishes. (`apps/raincloud/src/events/buttonInteraction.js:251`)
- Worker endpoints in `apps/rainbot` have no auth/worker-secret checks. If these ports are exposed, they allow unauthenticated control. Consider verifying `WORKER_SECRET` on all routes. (`apps/rainbot/src/index.ts:228`)
- `RequestCache` keys are requestId-only; if two endpoints reuse the same requestId, a response from one endpoint could be returned by another. Consider namespacing keys with endpoint. (`apps/rainbot/src/index.ts:251`)
- Worker protocol idempotency cache keys are requestId-only; a reused requestId across different actions can return the wrong cached response. Consider namespacing by action. (`packages/worker-protocol/src/server.ts:40`, `packages/worker-protocol/src/server.ts:62`)
- `ORCHESTRATOR_BOT_ID` can be missing but is still asserted as non-null in `setupAutoFollowVoiceStateHandler`, risking runtime errors. Guard before calling or short-circuit. (`apps/rainbot/src/index.ts:740`)
- `playNext` error path calls itself without `await`, which can create cascading unhandled rejections if failures persist. Consider awaiting or scheduling via `setImmediate`. (`apps/rainbot/src/index.ts:221`)
- Worker endpoints in `apps/pranjeet` have no auth/worker-secret checks. If these ports are exposed, they allow unauthenticated TTS and voice control. Consider verifying `WORKER_SECRET` on all routes. (`apps/pranjeet/src/index.ts:226`)
- `RequestCache` keys are requestId-only; if two endpoints reuse the same requestId, a response from one endpoint could be returned by another. Consider namespacing keys with endpoint. (`apps/pranjeet/src/index.ts:240`)
- `ORCHESTRATOR_BOT_ID` can be missing but is still asserted as non-null in `setupAutoFollowVoiceStateHandler`, risking runtime errors. Guard before calling or short-circuit. (`apps/pranjeet/src/index.ts:284`)
- Voice interaction manager is initialized with `enabled: true` unconditionally on ready, potentially enabling voice capture without explicit opt-in. Consider gating by env/feature flag. (`apps/pranjeet/src/index.ts:258`)
- Worker endpoints in `apps/hungerbot` have no auth/worker-secret checks. If these ports are exposed, they allow unauthenticated soundboard control. Consider verifying `WORKER_SECRET` on all routes. (`apps/hungerbot/src/index.ts:153`)
- `RequestCache` keys are requestId-only; if two endpoints reuse the same requestId, a response from one endpoint could be returned by another. Consider namespacing keys with endpoint. (`apps/hungerbot/src/index.ts:158`)
- `ORCHESTRATOR_BOT_ID` can be missing but is still asserted as non-null in `setupAutoFollowVoiceStateHandler`, risking runtime errors. Guard before calling or short-circuit. (`apps/hungerbot/src/index.ts:309`)
- Duplicate Drizzle migrations both create `listening_history` (`0000_listening_history.sql` and `0001_sleepy_felicia_hardy.sql`). This can break fresh installs or cause drift. Remove the duplicate or squash. (`packages/db/drizzle/0000_listening_history.sql`, `packages/db/drizzle/0001_sleepy_felicia_hardy.sql`)
- `getOrchestratorBaseUrl` appends `:${port}` to any URL without a trailing port; if `RAINCLOUD_URL` includes a path (e.g., `/api`), it produces an invalid URL (`https://host/api:3000`). Parse the URL and set `url.port` instead. (`packages/worker-shared/src/orchestrator.ts:9`)
- UI progress timer doesn’t reset when track changes, so the progress bar can jump or continue from prior track. Reset `currentTime` on track change. (`ui/src/components/NowPlayingCard.tsx:8`)
- `escapeHtml` is used on strings that React already escapes; this can double-escape and render entities (`&amp;`) in the UI. Remove escape or use `dangerouslySetInnerHTML` if actually needed. (`ui/src/components/soundboard/SoundCard.tsx:44`, `ui/src/lib/utils.ts:3`)
- Numerous `console.*` calls in UI (auth and API logging) will leak noisy info in production. Gate logs behind a dev flag. (`ui/src/stores/authStore.ts:29`, `ui/src/lib/api.ts:46`, `ui/src/App.tsx:22`)
- Performance stats filter uses `addCondition('execution_time_ms', 'IS NOT NULL')`, which compiles to `execution_time_ms = $1` and will error or return no rows. Use `IS NOT NULL` in the SQL or add a specialized method. (`server/routes/stats/statsService.ts:401`)
- `commands/voice/voiceSessionManager.js` requires local modules that do not exist (`./voiceInteractionInstance`, `./commandHelpers`, `../logger`), which will throw if this module is used. Update to the correct paths or remove the file if unused. (`commands/voice/voiceSessionManager.js:7`)
- Dashboard `showToast` injects unescaped message strings into `innerHTML`; if any API error/message includes user-controlled data, this is a DOM XSS vector. Use `textContent` or escape before insertion. (`public/app.js:57`)
- Sound cards inject `sound.name` into a `data-name` attribute without escaping; a name with quotes could break attributes and enable HTML injection. Escape or set via `dataset` after element creation. (`public/app.js:172`)

## Low

- Garbled log prefixes indicate encoding issues; use ASCII text for logs. (`server/middleware/requestLogger.ts:23`, `server/index.ts:50`, `utils/config.ts:212`)
- `LeaveResult`/`StopResult` live in `types/commands.ts` but are not exported under `commands/index.ts`, while the comment says they are under voice types. Align exports or move types. (`packages/protocol/src/commands/index.ts:1`, `packages/protocol/src/types/commands.ts:46`)
- Emoji-heavy log messages appear in voice modules; these can render as garbled text on Windows consoles. Consider ASCII alternatives. (`utils/voice/playbackManager.ts:49`, `utils/voice/voiceInteractionManager.ts:120`)
- In-memory stats buffers have no backpressure; if DB is down for long periods, memory can grow unbounded. Consider max buffer size or dropping on overflow. (`utils/statistics.ts:1`)
- Event loader only reads `.js` from `src/events`, so the TypeScript event `voiceStateUpdateMultibot.ts` is never registered. If it’s required, compile/load it or move it to JS. (`apps/raincloud/handlers/eventHandler.js:9`)
- Swagger cookie security scheme uses `connect.sid`, but the app sets `name: 'rainbot.sid'`. Docs will advertise the wrong cookie name. (`server/swagger.ts:92`, `server/index.ts:178`)
- TTS cache key ignores pitch/speakingRate, so different settings can return cached audio for the wrong voice parameters. Include pitch/speakingRate in cache key. (`utils/voice/textToSpeech.ts:200`)
- Raincloud avatar fallback assumes `discriminator` exists; for newer users it can be missing, producing a broken URL. Guard and use a safe default. (`apps/raincloud/server/routes/auth.ts:307`)
- Components README references `./dist/handlers/buttonRegistry`, but components are a package and handlers live under app code; this example path likely doesn’t exist, which can mislead integrators. Update README to the real import path or document the build output location. (`components/README.md:78`)
- Deployment docs reference `docs/INTEGRATION_GUIDE.md`, but that file is missing. Either add the doc or update the reference. (`docs/DEPLOYMENT.md:589`)

## Scan log

- 2026-01-29: Area = server (routes, middleware, config). Coverage = entrypoints and all route files under `server/routes/**` plus middleware and config. Depth = manual read for auth, exposure, and error handling; no additional issues found beyond those listed above.
- 2026-01-29: Area = server (stats routes/services + swagger). Coverage = `server/routes/stats/**`, `server/swagger.ts`, `server/routes/stats/queryBuilder.ts`. Depth = deep read for query correctness, API wiring, and schema consistency; added findings for missing service methods, broken `IS NOT NULL` filter, swagger cookie mismatch, and bad import paths in stats files.
- 2026-01-29: Area = server (auth routes). Coverage = `server/routes/auth.ts`. Depth = deep read for redirect flow, HTML rendering, and trust boundaries; added findings for reflected XSS in error page and open redirect via untrusted host.
- 2026-01-29: Area = server (api routes). Coverage = `server/routes/api/*.ts`, `server/routes/api/shared.ts`, `server/utils/roleVerifier.ts`, `server/middleware/requestLogger.ts`. Depth = manual read for auth gating, path handling, and stream safety; no new issues beyond those listed above.
- 2026-01-29: Area = server (tests). Coverage = `server/__tests__/*`, `server/routes/__tests__/*`. Depth = quick review for broken fixtures and outdated assertions; added finding for invalid stats test file.
- 2026-01-29: Area = server (stats validators). Coverage = `server/routes/stats/validators.ts`. Depth = quick read for input validation robustness; added finding for `parseLimit` returning NaN on invalid input.
- 2026-01-29: Area = server (api sounds + storage). Coverage = `server/routes/api/sounds.ts`, `utils/storage.ts`. Depth = targeted read for stream/content-type correctness; added finding for preview MIME mismatch when serving transcoded files.
- 2026-01-29: Area = server (stats routes). Coverage = `server/routes/stats/stats.ts`. Depth = quick follow-up for route wiring; added finding for bad listeningHistory import path.
- 2026-01-29: Area = server (remaining core files). Coverage = `server/index.ts`, `server/config.ts`, `server/client.ts`, `server/middleware/errorHandler.ts`, `server/routes/api/queue.ts`, `server/routes/api/playback.ts`, `server/routes/api/tracking.ts`. Depth = quick review for obvious logic/security issues; no additional issues found beyond those listed above.
- 2026-01-29: Area = utils/voice (deep pass). Coverage = `utils/voice/**` with focus on STT/TTS, fetchers, snapshots, and playback helpers. Depth = manual read for correctness and caching; added finding for TTS cache key missing pitch/speakingRate.
- 2026-01-29: Area = utils (non-voice, deep pass). Coverage = `utils/*.ts` (config, database, statistics, storage, listeningHistory, deployCommands, logger, playerEmbed, sourceType, voiceManager) + `utils/__tests__/*`. Depth = manual read for data correctness and persistence; added finding for track engagement insert missing listeners_at_end.
- 2026-01-29: Area = apps/raincloud (server auth). Coverage = `apps/raincloud/server/routes/auth.ts`. Depth = targeted read for auth flow and trust boundaries; added findings for reflected XSS, open redirect, missing OAuth state, debug exposure, and discriminator fallback.
- 2026-01-29: Area = apps/raincloud (server api). Coverage = `apps/raincloud/server/routes/api.ts`, `apps/raincloud/server/routes/internal.ts`, `apps/raincloud/server/index.ts`, `apps/raincloud/server/routes/stats.ts`. Depth = manual read for auth boundaries, exposure, and API correctness; added findings for unauthenticated sound/status endpoints, preview MIME mismatch, and default session secret risk.
- 2026-01-29: Area = apps/raincloud (server tests). Coverage = `apps/raincloud/server/__tests__/*`, `apps/raincloud/server/routes/__tests__/*`, `apps/raincloud/server/middleware/__tests__/*`. Depth = quick review for broken fixtures and outdated assertions; no additional issues found beyond those listed above.
- 2026-01-29: Area = apps/raincloud (handlers/lib/commands/events). Coverage = `apps/raincloud/handlers/**`, `apps/raincloud/lib/**`, `apps/raincloud/commands/**`, `apps/raincloud/src/events/*.js`. Depth = quick read for obvious logic/security issues; no additional issues found beyond those listed above.
- 2026-01-29: Area = utils/voice. Coverage = all files under `utils/voice/**` (playback, connection, queue, voice interaction, TTS). Depth = manual read for error handling, state correctness, privacy, cross-package coupling, and parameter validation.
- 2026-01-29: Area = utils (non-voice). Coverage = `config.ts`, `database.ts`, `deployCommands.ts`, `listeningHistory.ts`, `logger.ts`, `playerEmbed.ts`, `sourceType.ts`, `statistics.ts`, `storage.ts`, `voiceManager.ts`. Depth = manual read for schema consistency, buffer growth, log safety, and edge-case handling.
- 2026-01-29: Area = apps/raincloud. Coverage = entrypoint `index.js`, handlers, `src/events/**`, `commands/**` loader. Depth = manual read for event registration, async handling, and channel type safety.
- 2026-01-29: Area = apps/rainbot. Coverage = `src/index.ts` and `src/voice/*`. Depth = manual read for auth boundaries, idempotency, error recursion, and state management.
- 2026-01-29: Area = apps/pranjeet. Coverage = `src/index.ts`. Depth = manual read for auth boundaries, idempotency, voice capture defaults, and orchestrator wiring.
- 2026-01-29: Area = apps/hungerbot. Coverage = `src/index.ts`. Depth = manual read for auth boundaries, idempotency, and orchestrator wiring.
- 2026-01-29: Area = packages. Coverage = `protocol`, `rpc`, `db`, `shared`, `worker-protocol`, `worker-shared` (code + migrations). Depth = manual read for migration integrity, auth wiring, and TODOs.
- 2026-01-29: Area = packages (deep pass). Coverage = `packages/worker-protocol/src/server.ts`, `packages/worker-shared/src/orchestrator.ts`. Depth = targeted read for idempotency caching and URL construction; added findings for requestId-only cache and invalid port appending.
- 2026-01-29: Area = ui. Coverage = `src/**` (App, pages, hooks, stores, lib, key components). Depth = manual read for state correctness, rendering correctness, and production logging.
- 2026-01-29: Area = packages/worker-shared (full pass). Coverage = `packages/worker-shared/src/**`, `packages/worker-shared/package.json`, `packages/worker-shared/tsconfig.json`. Depth = full file read for correctness, error handling, and lifecycle issues; no additional findings beyond those already listed.
- 2026-01-29: Area = packages/worker-protocol (full pass). Coverage = `packages/worker-protocol/src/**`, `packages/worker-protocol/package.json`, `packages/worker-protocol/tsconfig.json`. Depth = full file read for correctness, error handling, and retry semantics; no additional findings beyond those already listed.
- 2026-01-29: Area = packages/redis-client (full pass). Coverage = `packages/redis-client/src/**`, `packages/redis-client/package.json`, `packages/redis-client/tsconfig.json`. Depth = full file read for lifecycle, error handling, and API usage; no additional findings beyond those already listed.
- 2026-01-29: Area = packages/protocol (full pass). Coverage = `packages/protocol/src/**`, `packages/protocol/package.json`, `packages/protocol/tsconfig.json`. Depth = full file read for type consistency and exports; no additional findings beyond those already listed.
- 2026-01-29: Area = packages/db (full pass). Coverage = `packages/db/src/**`, `packages/db/package.json`, `packages/db/tsconfig.json`, `packages/db/drizzle/**`. Depth = full file read for schema consistency, migrations, and repository queries; no additional findings beyond those already listed.
- 2026-01-29: Area = packages/rpc (full pass). Coverage = `packages/rpc/src/**`, `packages/rpc/package.json`, `packages/rpc/tsconfig.json`. Depth = full file read for auth gating, router wiring, and client config; no additional findings beyond those already listed.
- 2026-01-29: Area = packages/shared (full pass). Coverage = `packages/shared/src/**`, `packages/shared/package.json`, `packages/shared/tsconfig.json`. Depth = full file read for logging behavior and sensitive data handling; no additional findings beyond those already listed.
- 2026-01-29: Area = commands (full pass). Coverage = `commands/**` (voice + utility + helpers). Depth = full file read for module resolution, command flow, and response handling; added finding for missing local module paths in voiceSessionManager.
- 2026-01-29: Area = components (full pass). Coverage = `components/**` (builders, buttons, tests, README). Depth = full file read for button IDs, metadata parsing, and docs accuracy; added finding for README import path mismatch.
- 2026-01-29: Area = db (full pass). Coverage = `db/listeningHistory.ts`. Depth = full file read for adapter wiring and exports; no additional findings beyond those already listed.
- 2026-01-29: Area = docs (full pass). Coverage = `docs/*.md`. Depth = full file read for accuracy, references, and workflow correctness; added finding for missing integration guide reference.
- 2026-01-29: Area = scripts (full pass). Coverage = `scripts/setup-database.js`. Depth = full file read for config usage and failure handling; no additional findings beyond those already listed.
- 2026-01-29: Area = types (full pass). Coverage = `types/*.ts` (deprecated re-exports). Depth = full file read for deprecation paths and module wiring; no additional findings beyond those already listed.
- 2026-01-29: Area = public (full pass). Coverage = `public/index.html`, `public/style.css`, `public/app.js`, `public/stats.js`, `public/components/serverSelector.js`. Depth = full file read for DOM safety and client-side behavior; added findings for unsafe innerHTML and unescaped data attributes.
- 2026-01-29: Area = packages/utils (pass). Coverage = `packages/utils/` (no source files found; only `dist/` + `.turbo/`). Depth = directory scan; no review performed due to missing source.
