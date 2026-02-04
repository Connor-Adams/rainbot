---
name: Pranjeet and Hungerbot refactor (shared, modular)
overview: Refactor both workers into modular pieces; add shared HTTP/runtime layer; clarify tRPC vs Express; design for easy addition of new workers.
todos: []
isProject: false
---

# Pranjeet and Hungerbot refactor (shared, modular)

## Definition of done

**Work is not complete until `yarn validate` passes** (type-check, lint, format, tests). After each completion step or phase, run `yarn validate` from the repo root and fix any failures before proceeding.

---

## Overview

- **Pranjeet**: Split `[apps/pranjeet/src/index.ts](apps/pranjeet/src/index.ts)` (~857 lines) into focused modules; use shared HTTP/runtime from worker-shared.
- **Hungerbot**: Split `[apps/hungerbot/src/index.ts](apps/hungerbot/src/index.ts)` (~534 lines) into focused modules; same shared layer.
- **worker-shared**: Add auth, health, server start, and optionally a **worker HTTP app factory** so new workers need only: config + handlers + router + optional voice-state extension.
- **Design goal**: Init a new worker easily with a plethora of shared code; minimal worker-specific code (config, handler implementations, optional events).

---

## Deep scan summary (nothing missed)

### Communication: tRPC over HTTP

- **Orchestrator → workers**: Raincloud calls workers via **tRPC over HTTP**. `[apps/raincloud/src/rpc/clients.ts](apps/raincloud/src/rpc/clients.ts)` uses `createTRPCClient<XRouter>({ baseUrl, secret })` with `httpBatchLink` to `${baseUrl}/trpc`. So every worker **must** expose an HTTP server with a `/trpc` endpoint.
- **Do we still need Express?** Yes for the current setup. tRPC is served using `@trpc/server/adapters/express` (`createExpressMiddleware({ router, createContext })`). The transport is HTTP; the adapter is Express. Alternatives exist (e.g. `@trpc/server/adapters/standalone` with Node `http.createServer`) but would require adding health routes manually on the same server. Keeping Express is the path of least change; we can document "optional later: switch to standalone adapter to drop Express" if desired.
- **Legacy**: `[packages/worker-protocol/src/server.ts](packages/worker-protocol/src/server.ts)` has `WorkerServerBase` (REST-style `/join`, `/leave`, etc.). The three current workers do **not** use it; they use tRPC only. No refactor dependency on WorkerServerBase.

### Worker contract (what a worker must provide)

- **HTTP server** listening on PORT, with:
  - **Auth**: All non-health requests require `x-internal-secret` or `x-worker-secret` equal to WORKER_SECRET.
  - **tRPC** at `/trpc` with router created from handlers (getState + join, leave, volume, + bot-specific mutations). Context from `createContext` in `[packages/rpc/src/trpc.ts](packages/rpc/src/trpc.ts)`.
  - **Health**: GET `/health/live` (200 OK), GET `/health/ready` (JSON: status, uptime, botType, ready, degraded, optional queueReady, timestamp).
- **Discord client**: Same intents (Guilds, GuildVoiceStates); login with worker token; optional degraded mode (HTTP only if no token).
- **Auto-follow**: `setupAutoFollowVoiceStateHandler(client, { orchestratorBotId, guildStates, getOrCreateGuildState })` from worker-shared so the worker follows the orchestrator bot in/out of voice.
- **Registration**: On ready, POST to orchestrator `${RAINCLOUD_URL}/internal/workers/register` with botType, instanceId, startedAt, version; header `x-worker-secret`.

### Orchestrator side (adding a new worker type)

- **BotType** is hardcoded in `[packages/protocol/src/types/core.ts](packages/protocol/src/types/core.ts)`: `'rainbot' | 'pranjeet' | 'hungerbot'`. Adding a new worker type requires updating that type and every place that switches on botType.
- **Raincloud** explicitly wires the three workers: `[apps/raincloud/src/rpc/clients.ts](apps/raincloud/src/rpc/clients.ts)` (RAINBOT_URL, PRANJEET_URL, HUNGERBOT_URL, rainbotClient, pranjeetClient, hungerbotClient), `[apps/raincloud/lib/workerCoordinator.ts](apps/raincloud/lib/workerCoordinator.ts)` (switch(botType) for getState, join, leave, volume, playSound, speak, enqueue, etc.), `[apps/raincloud/lib/workerCoordinatorRegistry.ts](apps/raincloud/lib/workerCoordinatorRegistry.ts)` (BotType), `[apps/raincloud/server/routes/internal.ts](apps/raincloud/server/routes/internal.ts)` (`allowedBotTypes` for `/workers/register`). So "init a new worker" on the **orchestrator** side means: add BotType, add env (e.g. NEWBOT_URL), add tRPC client and router type in rpc package, add cases in workerCoordinator, add to allowedBotTypes and workerBaseUrls. That is out of scope for this refactor but should be documented.
- **Worker app side** (in scope): Maximize shared code so a new worker app = config + handler implementations + router creation + optional voice-state handler + single `runWorker()` call.

### Packages and dependencies

- **worker-shared** (`[packages/worker-shared/src/index.ts](packages/worker-shared/src/index.ts)`): errors, orchestrator, stats, express (createWorkerExpressApp only), validation, idempotency (RequestCache), client (Discord), voice-state (setupAutoFollowVoiceStateHandler, GuildState). No tRPC dependency.
- **rpc** (`[packages/rpc](packages/rpc)`): trpc (createContext, internalProcedure), client (createTRPCClient for raincloud), routers (createRainbotRouter, createPranjeetRouter, createHungerbotRouter). Each router takes a `handlers` object; procedures use `internalProcedure` (secret required).
- **worker-protocol** (`[packages/worker-protocol](packages/worker-protocol)`): types (JoinRequest/Response, StatusResponse, etc.); WorkerServerBase (legacy, unused by current workers).
- **Workers** (pranjeet, hungerbot, rainbot): Depend on worker-shared, @rainbot/rpc, @rainbot/worker-protocol; each mounts tRPC with its own router and createContext from @rainbot/rpc.

### Nothing-missed checklist

- How orchestrator calls workers (tRPC over HTTP; clients.ts, workerCoordinator)
- Whether Express is required (yes for current tRPC adapter; standalone alternative exists)
- Worker registration (POST /internal/workers/register; allowedBotTypes; recordWorkerRegistration)
- Health checks (fetchWorkerHealthChecks uses rainbotClient.health.query() etc.)
- BotType and where it is defined (protocol/core.ts; worker-protocol types; raincloud internal + coordinator)
- RequestCache usage (idempotency for join/leave/volume/speak/playSound etc.)
- createContext and auth (rpc/trpc.ts; internalProcedure; workers use same secret header)
- Legacy WorkerServerBase (present but unused by current workers)

---

## Part 1: Shared layer (packages/worker-shared)

### 1.1 Required additions


| Piece               | Purpose                                                          | API                                                                 |
| ------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------- |
| **Auth middleware** | Skip `/health`, require `x-internal-secret` or `x-worker-secret` | `createWorkerAuthMiddleware(workerSecret: string                    |
| **Health routes**   | GET `/health/live`, GET `/health/ready`                          | `addWorkerHealthRoutes(app, { botType, getReady, getQueueReady? })` |
| **Server start**    | Single listen with guard and log                                 | `startWorkerServer(app, port, log)` (module-level serverStarted)    |


Workers continue to mount tRPC themselves (each worker has access to its router and createContext from @rainbot/rpc). No new dependency on @rainbot/rpc or @trpc/server in worker-shared for 1.1.

### 1.2 Optional: full worker HTTP app factory (max modularity)

To make "init a new worker" a one-liner for the HTTP surface, add a factory that builds the full app (auth + tRPC + health):

- **Option A (no tRPC in worker-shared)**: Worker app still does: `const app = createWorkerExpressApp(); app.use(createWorkerAuthMiddleware(secret)); app.use('/trpc', trpcExpress.createExpressMiddleware({ router, createContext })); addWorkerHealthRoutes(app, options); startWorkerServer(app, port, log);` — just using shared middleware and helpers.
- **Option B (tRPC in worker-shared)**: Add dependency `@trpc/server` (adapters/express) to worker-shared and export `createWorkerHttpApp(router, createContext, options)` that does the above. Then a worker only does: `const app = createWorkerHttpApp(router, createContext, { workerSecret, port, botType, getReady, getQueueReady? }); startWorkerServer(app, port, log);` (or fold start into the factory). New worker = create router from handlers + one createWorkerHttpApp call.

Recommendation: Start with **Option A** (shared middleware + health + start only); introduce Option B only if we add a fourth worker and want a single "worker runtime" entrypoint.

### 1.3 Optional (later)

- `readWorkerEnv({ portKey, tokenKey })` → common env subset (PORT, TOKEN, ORCHESTRATOR_BOT_ID, RAINCLOUD_URL, WORKER_SECRET, hasToken, hasOrchestrator).
- `performJoin(client, input, getOrCreateGuildState)` / `performLeave(input, guildStates, onLeave?)` to deduplicate join/leave logic across workers.

---

## Part 2: Pranjeet refactor (apps/pranjeet)

### Target layout


| File                      | Purpose                                                                                                                                                                                                                                                                           |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **config.ts**             | Env (PORT, TOKEN, TTS_*, REDIS_URL, VOICE_*, ORCHESTRATOR_BOT_ID, WORKER_SECRET, etc.), log, hasToken, hasOrchestrator                                                                                                                                                            |
| **state/guild-state.ts**  | PranjeetGuildState, guildStates Map, getOrCreateGuildState, buildPlaybackState, getStateForRpc                                                                                                                                                                                    |
| **audio/utils.ts**        | waitForPlaybackEnd, chunkPcmIntoFrames, framesToReadable, resample24to48, monoToStereoPcm                                                                                                                                                                                         |
| **tts/index.ts**          | initTTS, generateTTS, normalizeSpeakKey; internal OpenAI/Google                                                                                                                                                                                                                   |
| **speak.ts**              | speakInGuild(guildId, text, voice?)                                                                                                                                                                                                                                               |
| **voice-interaction.ts**  | isVoiceInteractionEnabled(guildId); uses getRedisClient from queue                                                                                                                                                                                                                |
| **handlers/rpc.ts**       | createRpcHandlers(client, requestCache) → { getState, join, leave, volume, speak }                                                                                                                                                                                                |
| **app.ts**                | createWorkerExpressApp(), createWorkerAuthMiddleware(), tRPC mount, addWorkerHealthRoutes(), startServer = startWorkerServer()                                                                                                                                                    |
| **events/voice-state.ts** | registerVoiceStateHandlers(client): user join/leave → start/stop voice listening                                                                                                                                                                                                  |
| **queue/tts-worker.ts**   | startTtsQueue(options), getRedisClient(), queueReady                                                                                                                                                                                                                              |
| **index.ts**              | Thin: config, client, requestCache, router(createRpcHandlers), app, setupAutoFollowVoiceStateHandler, registerVoiceStateHandlers, setupDiscordClientReadyHandler (initTTS, initVoiceInteractionManager, startServer, registerWithOrchestrator, startTtsQueue), loginDiscordClient |


### Order of work

1. worker-shared: createWorkerAuthMiddleware, addWorkerHealthRoutes, startWorkerServer.
2. Pranjeet: config, state/guild-state, audio/utils.
3. Pranjeet: tts/index, speak, queue/tts-worker, voice-interaction.
4. Pranjeet: handlers/rpc, app, events/voice-state.
5. Pranjeet: rewrite index.ts.

---

## Part 3: Hungerbot refactor (apps/hungerbot)

### Target layout


| File                      | Purpose                                                                                                                                                                                                              |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **config.ts**             | PORT, TOKEN, SOUNDS_DIR, S3_*, ORCHESTRATOR_BOT_ID, RAINCLOUD_URL, WORKER_SECRET, log, hasToken, hasOrchestrator                                                                                                     |
| **state/guild-state.ts**  | HungerbotGuildState, guildStates, getOrCreateGuildState, getStateForRpc                                                                                                                                              |
| **storage/sounds.ts**     | S3 client (if configured), getSoundStream(sfxId), responseBodyToStream, getOggVariant, normalizeSoundName, getSoundInputType                                                                                         |
| **handlers/rpc.ts**       | createRpcHandlers(client, requestCache) → getState, join, leave, volume, playSound, cleanupUser; playSound uses storage + createAudioResource + reportSoundStat                                                      |
| **app.ts**                | createWorkerExpressApp(), createWorkerAuthMiddleware(), tRPC mount, addWorkerHealthRoutes(), startServer = startWorkerServer()                                                                                       |
| **events/voice-state.ts** | VoiceStateUpdate: when orchestrator leaves channel, state.player.stop(true)                                                                                                                                          |
| **index.ts**              | Thin: config, client, requestCache, router(createRpcHandlers), app, setupAutoFollowVoiceStateHandler, events/voice-state, setupDiscordClientReadyHandler (startServer, registerWithOrchestrator), loginDiscordClient |


### Order of work

1. worker-shared (already done in Part 1).
2. Hungerbot: config, state/guild-state.
3. Hungerbot: storage/sounds.
4. Hungerbot: handlers/rpc, app, events/voice-state.
5. Hungerbot: rewrite index.ts.

---

## Part 4: How modular can we make it? (Init a new worker easily)

### Worker app side (after this refactor)

A new worker would need to implement:

1. **Config** – Worker-specific env (e.g. PORT, TOKEN, ORCHESTRATOR_BOT_ID, RAINCLOUD_URL, WORKER_SECRET + any bot-specific vars). Can use shared `readWorkerEnv` if we add it.
2. **Guild state** – Worker-specific state shape (extends GuildState from worker-shared); getOrCreateGuildState, getStateForRpc.
3. **Handlers** – Implement the handler interface expected by the router (getState + join, leave, volume + bot-specific). Can use shared performJoin/performLeave if we add them.
4. **Router** – In `packages/rpc`: add new router (e.g. createNewbotRouter(handlers)) and export; input schemas and handler types as today.
5. **App** – createWorkerExpressApp(), createWorkerAuthMiddleware(secret), app.use('/trpc', createExpressMiddleware({ router, createContext })), addWorkerHealthRoutes(app, { botType, getReady }), startWorkerServer(app, port, log).
6. **Optional: voice-state extension** – If the worker needs extra VoiceStateUpdate logic (e.g. pranjeet start/stop voice listening, hungerbot stop player on orchestrator leave), register it in index.
7. **Index** – Create client (createWorkerDiscordClient), requestCache (RequestCache), router from createRpcHandlers, app; setupAutoFollowVoiceStateHandler; setupDiscordClientReadyHandler (onReady: startServer, registerWithOrchestrator, any bot-specific init); loginDiscordClient.

Shared resources used by every worker:

- worker-shared: createWorkerExpressApp, createWorkerAuthMiddleware, addWorkerHealthRoutes, startWorkerServer, RequestCache, createWorkerDiscordClient, setupDiscordClientErrorHandler, setupDiscordClientReadyHandler, loginDiscordClient, setupAutoFollowVoiceStateHandler, GuildState, registerWithOrchestrator, getOrchestratorBaseUrl, setupProcessErrorHandlers, logErrorWithStack, reportSoundStat (if applicable).
- @rainbot/rpc: createContext, createXxxRouter (per worker type).
- @rainbot/worker-protocol: request/response types.

### Orchestrator side (document only; not in this refactor)

To register a **new** worker type with the orchestrator:

- Add BotType in `packages/protocol/src/types/core.ts` and `packages/worker-protocol` if needed.
- Add new router and client in `packages/rpc` (router + export).
- In raincloud: env (e.g. NEWBOT_URL), workerBaseUrls, new client, fetchWorkerHealthChecks + fetchWorkerState cases, allowedBotTypes in internal routes, workerCoordinator switch cases for every action that routes to that bot.

---

## Part 5: Completion steps

Execute in order. After each step (or step group), run `**yarn validate**` and fix any failures before continuing.

### Phase 1: worker-shared


| Step | Action                                                                                                                                                         | Validate        |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| 1.1  | Add `createWorkerAuthMiddleware(workerSecret)` in `packages/worker-shared/src` (e.g. new file `middleware.ts` or extend `express.ts`). Export from `index.ts`. | `yarn validate` |
| 1.2  | Add `addWorkerHealthRoutes(app, { botType, getReady, getQueueReady? })` in worker-shared. Export from `index.ts`.                                              | `yarn validate` |
| 1.3  | Add `startWorkerServer(app, port, log)` in worker-shared (module-level `serverStarted` guard). Export from `index.ts`.                                         | `yarn validate` |


### Phase 2: Pranjeet refactor


| Step | Action                                                                                                                                                                                                                                                                   | Validate        |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------- |
| 2.1  | Create `apps/pranjeet/src/config.ts` (env, log, hasToken, hasOrchestrator).                                                                                                                                                                                              | `yarn validate` |
| 2.2  | Create `apps/pranjeet/src/state/guild-state.ts` (PranjeetGuildState, guildStates, getOrCreateGuildState, buildPlaybackState, getStateForRpc).                                                                                                                            | `yarn validate` |
| 2.3  | Create `apps/pranjeet/src/audio/utils.ts` (waitForPlaybackEnd, chunkPcmIntoFrames, framesToReadable, resample24to48, monoToStereoPcm).                                                                                                                                   | `yarn validate` |
| 2.4  | Create `apps/pranjeet/src/tts/index.ts` (initTTS, generateTTS, normalizeSpeakKey; OpenAI/Google). Create `speak.ts` (speakInGuild). Create `queue/tts-worker.ts` (startTtsQueue, getRedisClient, queueReady). Create `voice-interaction.ts` (isVoiceInteractionEnabled). | `yarn validate` |
| 2.5  | Create `apps/pranjeet/src/handlers/rpc.ts` (createRpcHandlers → getState, join, leave, volume, speak).                                                                                                                                                                   | `yarn validate` |
| 2.6  | Create `apps/pranjeet/src/app.ts` (createWorkerExpressApp, createWorkerAuthMiddleware, tRPC mount, addWorkerHealthRoutes, startServer = startWorkerServer). Create `events/voice-state.ts` (registerVoiceStateHandlers).                                                 | `yarn validate` |
| 2.7  | Rewrite `apps/pranjeet/src/index.ts` to import and wire config, client, requestCache, router, app, auto-follow, voice-state, onReady, login. Remove duplicated logic.                                                                                                    | `yarn validate` |


### Phase 3: Hungerbot refactor


| Step | Action                                                                                                                                                 | Validate        |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------- |
| 3.1  | Create `apps/hungerbot/src/config.ts`. Create `apps/hungerbot/src/state/guild-state.ts`.                                                               | `yarn validate` |
| 3.2  | Create `apps/hungerbot/src/storage/sounds.ts` (S3 client, getSoundStream, responseBodyToStream, getOggVariant, normalizeSoundName, getSoundInputType). | `yarn validate` |
| 3.3  | Create `apps/hungerbot/src/handlers/rpc.ts` (createRpcHandlers → getState, join, leave, volume, playSound, cleanupUser).                               | `yarn validate` |
| 3.4  | Create `apps/hungerbot/src/app.ts` (shared auth, health, startWorkerServer). Create `events/voice-state.ts` (orchestrator leave → player.stop).        | `yarn validate` |
| 3.5  | Rewrite `apps/hungerbot/src/index.ts` to import and wire everything. Remove duplicated logic.                                                          | `yarn validate` |


### Phase 4: Final validation


| Step | Action                                                                                | Validate                                                                |
| ---- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| 4.1  | Run full monorepo validation. Fix any remaining type, lint, format, or test failures. | `**yarn validate**` (required before considering the refactor complete) |


---

## Summary

- **Definition of done**: The refactor is complete only when `**yarn validate**` passes (type-check, lint, format, tests). Run it after each completion step and again at Phase 4 before closing out.
- **tRPC**: Workers communicate with the orchestrator via tRPC over HTTP. We still need an HTTP server; currently that is Express with the tRPC Express adapter. Alternatives (standalone adapter) can be considered later.
- **Shared (worker-shared)**: Auth middleware, health routes, server start; optionally later: readWorkerEnv, join/leave helpers, full createWorkerHttpApp.
- **Pranjeet-only**: config, guild state, audio utils, TTS, speak, voice-interaction, RPC handlers, app composition, voice-state events, TTS queue.
- **Hungerbot-only**: config, guild state, storage/sounds, RPC handlers, app composition, voice-state events (orchestrator leave cleanup).
- **New worker**: Implement config, guild state, handlers, add router in rpc package, compose app with shared middleware + health + startServer, optional voice-state extension, thin index; orchestrator changes (BotType, env, client, coordinator) documented separately.

