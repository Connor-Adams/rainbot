# Node telemetry — SDD progress

Plan: docs/superpowers/plans/2026-09-23-telemetry-node.md
Branch: claude/telemetry-node
Task 1: complete (commits 2b0e455..0eb540d, review clean)
Minor (for final review): semconv.test.ts pins only 3 of 12 attribute values
against exact strings; a typo in the other 9 would pass. Plan-level gap —
tighten to `expect(RainbotAttr).toEqual({...})`.
Note for all later tasks: `yarn workspace <pkg> test` fails repo-wide
(jest not on the workspace PATH). Use `yarn turbo run test --filter=<pkg>`.
Task 2: complete — src/node/sdk.ts + src/node/index.ts + sdk.test.ts, per
task-2-report.md. yarn validate green repo-wide. No peer-dep fallout from
auto-instrumentations-node despite Task 1's flagged risk.
Task 2: complete (commits 0eb540d..d4938f8, review clean after one fix pass)
Fixed: plan's "unreachable collector" test constrained nothing; replaced with
a mocked NodeSDK.start() throw. Mutation-checked: removing sdk.ts's try/catch
now fails the test.
Task 3: complete (commits d4938f8..178b46e, review clean after one fix pass)
Fixed: error-path test asserted only a message substring, so a wrapper
mutation passed. Now asserts instance identity; mutation-verified.
Task 4: complete (commits 178b46e..317904f, review clean)
PLAN BUG CAUGHT: brief created metric instruments at module scope. OTel's
metrics API has no proxy layer, so getMeter() binds to the no-op provider
at first call and never retargets — all six instruments would have recorded
nothing forever, silently. Fixed with lazy memoized creation. Confirmed
independently against node_modules/@opentelemetry/api source. spans.ts is
NOT affected (ProxyTracer re-resolves per call).
Minor (for final review): metrics.ts:105-106 comment claims an ordering
"ensures the first registration is never dropped"; the ordering has no
effect, the gauge callback reads the map at collection time.
Task 5: complete (commits 317904f..4fa0413, review clean after one fix pass)
PLAN BUG CAUGHT: brief named the injected callback field `emit`, which
shadows EventEmitter.emit inherited via winston-transport — built-in Winston
transports call this.emit('logged', info), so it would have silently broken
Winston's event plumbing. Renamed to emitLog.
Logs API HAS a proxy layer (unlike metrics), so per-call getLogger() is safe.
Fixed: no test activated a span, so trace correlation was unconstrained.
New test mutation-verified against both block-deletion and key-rename.
Task 6: complete (commits 4fa0413..7f1c544, review clean after one fix pass)
Wired OTLP transport into both logger modules. Needed tsconfig paths in 5
files (moduleResolution:node ignores exports subpaths; paths don't merge
across extends) and a widened fs mock in a pre-existing utils test.
Fixed: barrel eagerly loaded the whole SDK, so OTEL_SDK_DISABLED still paid
~190ms. SDK imports now lazy inside startTelemetry(). Evidence: disabled
path went 1761 -> 74 modules loaded. Task 2's mock still constrains.
UI bundle checked: ui/ imports only @rainbot/shared subpaths, so node OTel
cannot reach the Vite bundle. Discipline-only (eslint ignores ui/\*\*).

PLAN BUG found before Task 7: plan claims TS import hoisting makes the
startTelemetry() body call run first. Wrong — all imports evaluate before
any body statement, so discord.js/express/redis load before the SDK starts
and auto-instrumentation patches nothing. Task 7 must use a separate
side-effect module imported first. Task 8 (raincloud CJS) is unaffected.
Task 7: complete — deviated from the brief per the bug above. Added
apps/{rainbot,pranjeet,hungerbot}/src/telemetry.ts (startTelemetry side
effect) and made `import './telemetry'` the first line of each index.ts,
above every other import. Added @rainbot/observability to each worker's
package.json and a paths entry to apps/rainbot/tsconfig.json (its own
`paths` block replaces root's, unlike hungerbot/pranjeet which already
inherit or had it). Compiled dist confirms `require("./telemetry")` is the
first statement in all three, ahead of `require("@rainbot/rpc")`.
Evidence the ordering holds at runtime: patched Module.prototype.require in
a throwaway harness around dist/hungerbot with OTEL*SDK_DISABLED=false and
observed `@opentelemetry/sdk-node` required before `discord.js` — order:
["sdk-node required", "discord.js required"]. All three workers still
start cleanly under OTEL_SDK_DISABLED=true (reach "Worker server listening
on port ..." despite the missing token). yarn validate green (26/26).
Task 7: complete (commits 7f1c544..b1c2e94, review clean)
Used a separate side-effect module apps/<worker>/src/telemetry.ts imported
first, NOT the brief's in-index call (see plan bug above). Ordering proven
with a Module.prototype.require hook and independently reproduced by the
reviewer: sdk-node loads before discord.js in all three workers.
Minor (for final review): nothing statically guards against a future edit
inserting an import above `import './telemetry';`. A --require preload
would be immune; the side-effect-import pattern is not.
Task 8: complete (commits b1c2e94..48f06e1, review clean)
raincloud bootstraps inline (CJS, source-order require) above the
Module.\_resolveFilename monkeypatch. Ordering and alias resolution both
independently reproduced by the reviewer.
Minor (for final review): dotenv loads at index.js:14, AFTER the telemetry
bootstrap at :7, so OTEL*\* set only in a local .env is ignored. Production
is unaffected (Dokploy injects real env vars). Fix is to move the dotenv
require above the bootstrap — dotenv is not an instrumented module.
Task 9: complete, per task-9-report.md.
Registration gauge: instrumented 5 terminal states in orchestrator.ts, not
the brief's 3 — also the "invalid RAINCLOUD_URL" early return and the
non-ok HTTP response branch (which also gives up permanently, no retry).
Both are equally silent-failure paths and belong on the gauge.
RPC span: the brief's client.ts sketch (`procedure`/`workerName`/`invoke()`)
doesn't exist in the real file — createTRPCClient just builds a raw
createTRPCProxyClient and returns it; there's no per-call wrapper to edit.
Adapted by adding a `worker` option and wrapping the returned proxy in a
path-tracking Proxy that intercepts only the terminal `query`/`mutate`
methods (not `subscribe` — it's sync/observer-based, no subscriptions exist
in this repo, and wrapping it would change control flow). withSpan +
recordRpcDuration wrap the underlying call via Reflect.apply; errors
propagate by reference (verified with a same-instance test, mirroring
spans.test.ts's identity check). Updated the one call site
(apps/raincloud/src/rpc/clients.ts) to pass worker: 'rainbot'/'pranjeet'/
'hungerbot'. Added packages/rpc/jest.config.js (rpc had none — no prior
tests) plus a telemetry test. yarn validate green (26/26, 500 utils + 151
raincloud tests unaffected).
Task 9: complete (commits 48f06e1..d56344d, review clean after two fix passes)
Instrumented 5 registration give-up paths, not the plan's 3 (invalid
RAINCLOUD_URL and non-2xx response are also permanent).
Client RPC span uses a Proxy (the plan's per-call-wrapper sketch did not
match reality); verified against a real tRPC client, then-safety intact.
CORRECTION to an earlier claim: trace-context propagation ALREADY works via
instrumentation-undici on httpBatchLink's fetch — client and server trace
ids match. Cross-service traces connect without extra plumbing.
CRITICAL fixed: tRPC's next() RESOLVES with {ok:false,error} instead of
rejecting, so withSpan's catch was dead code — a WORKER_SECRET mismatch
would have shown as a successful span. Now inspects result.ok. Mutation-
verified. Also: trace.getActiveSpan() needs a registered ContextManager,
which tests were missing and production gets from NodeSDK.start().
Task 10: complete, per task-10-report.md.
queue.mutate: wrapped withQueueLock exactly per brief, lock acquisition
inside the span. Existing withQueueLock suite untouched and green.
track.resolve: the brief's file scope (trackFetcher.ts only) covers just the
rare metadata-fallback yt-dlp call, not the yt-dlp call that actually
resolves a playable stream — metrics.ts's own docstring says the duration
histogram is "time to resolve a track to a playable stream" and the failure
counter should "trend up before playback fails outright." Deviated:
also instrumented getStreamUrl's yt-dlp call in audioResource.ts (the
async-fallback path) with the same track.resolve span/metrics, tagged via
the pre-existing (till-now-unused) RainbotAttr.extractionPath: 'metadata' |
'get-url' | 'pipe'.
ANOTHER resolve-with-error-value trap found (matches Task 9's tRPC one):
createTrackResourcePipe's yt-dlp subprocess never rejects on failure — it
races the subprocess against a timeout and returns null on 'exited'/'failed'
outcomes. withSpan would see this as a clean return and record nothing.
Recorded recordTrackResolve/recordTrackResolveFailure directly off the race
outcome instead of relying on withSpan's exception-based detection; no span
here since there is no exception to attach ERROR status to.
audio.resource.create: wrapped both createAudioResource call sites (async
fetch path and pipe stdout path) exactly per brief; both are hardcoded
StreamType.Arbitrary so transcoded is always true at these two sites.
Added RainbotAttr.streamType/transcoded to semconv.ts (brief inlined them as
string literals; CLAUDE.md-adjacent convention here is no inline attribute
keys).
packages/utils needed new devDependencies (@opentelemetry/api,
@opentelemetry/sdk-trace-base) to write a real-span telemetry test for
withQueueLock, mirroring packages/rpc's existing pattern
(trpc.span.test.ts) rather than the brief's mocked-withSpan style used in
client.telemetry.test.ts. yarn validate green (26/26, 502 utils tests
including the 2 new queue.mutate tests, 27 rainbot-worker tests unaffected).
Task 10: complete (commits d56344d..ba90a8c, review clean after one fix pass)
withQueueLock instrumented WITHOUT changing locking behaviour — verified
byte-for-byte; release still runs before span.end() during unwind; the
pre-existing queueManager suite is untouched and green.
track.resolve broadened to all three real yt-dlp sites (the plan named one
that was only the metadata fallback).
TRAP: createTrackResourcePipe resolves null on failure instead of rejecting,
so withSpan would miss it — failure counter recorded off the race outcome.
Fixed: audio.resource.create covered only 2 of 4 sites. The two missed ones
are the play-dl fallback (used exactly when yt-dlp fails) and all non-
YouTube sources, so the metric would have read as an outage during a rot
incident. Added RainbotAttr.resolutionPath. Mutation-verified.
NOTE: the Task 10 fix re-review is deferred to the final whole-branch
review — it is test-covered and mutation-verified.
Task 11: complete — see .superpowers/sdd/task-11-report.md for full detail.
BRIEF GAP CAUGHT: voice connections are established/torn down from a
SECOND path the brief didn't name — packages/worker-shared/src/voice-state.ts's
setupAutoFollowVoiceStateHandler, used by all three workers to follow the
orchestrator's own voice channel. Instrumenting only voiceRpcHandlers.ts
would have under-counted every auto-follow join/leave/move. Added a shared
WeakSet-keyed markVoiceConnected/markVoiceDisconnected helper
(voiceConnectionMetrics.ts) so both files' destroy() sites stay balanced
and idempotent regardless of call order.
TRAP (x2): createPlaySoundHandler and getGrokReply (pranjeet's chat/grok.ts,
the actual grok.converse call — the realtime voice-agent WS in
voice-agent/grokVoiceAgent.ts has no discrete request/response shape to
wrap and was deliberately left uninstrumented, flagged for Connor) both
resolve normal-looking values on failure instead of throwing. Fixed with
trace.getActiveSpan() inside the withSpan callback, following trpc.ts's
precedent; sound.play also calls recordException when there's a real Error.
Gauge drift: NOT expected under normal operation — VoiceConnectionStatus
can only reach Destroyed via an explicit .destroy() call, and every
.destroy() site in both files is now paired with a mark call. Verified
@discordjs/voice's own heartbeat (3 missed heartbeats force-closes the ws)
funnels a dead gateway link through the Disconnected state, which IS
instrumented, so a network zombie doesn't sidestep the accounting.
Deliberately out of scope: packages/utils/voice/connectionManager.ts's
joinChannel/leaveChannel — a raincloud-only fallback used exclusively when
ALL workers are unreachable (`/join` degrades to "orchestrator only" mode);
flagged rather than instrumented given how rarely it's live.
hungerbot and pranjeet had no working jest setup (hungerbot: no
jest.config.js at all; pranjeet: one with no ts-jest preset, so .test.ts
would never transform) — added jest/ts-jest/@types/jest/@opentelemetry/\*
devDependencies and configs to both, mirroring apps/rainbot's. yarn
validate green (26/26 tasks, 806 tests total, including the 502 utils and
151 raincloud tests unaffected).
