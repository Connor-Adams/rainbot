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
Task 11: complete (commits ba90a8c..3d8f612, review clean after one fix pass)
Found a SECOND connect/teardown path the plan missed: voice-state.ts
auto-follow, used by all three workers. Without it the gauge would have
drifted upward forever. Idempotent WeakSet-keyed helper prevents double
decrement. No drift path found by the reviewer's independent audit.
Two more resolve-with-failure-value traps fixed (createPlaySoundHandler,
getGrokReply) via trace.getActiveSpan().
Fixed a PRE-EXISTING crash bug found next to our work: the auto-follow
connection had no 'error' listener while its sibling did, and this repo
exits the process on uncaught exceptions — a voice gateway error killed
the whole worker. Mutation-verified.
Open (for final review): the realtime Grok Voice Agent is untraced —
grok.converse landed on the STT/text fallback path. Instrumenting a
WebSocket realtime session needs its own span-lifecycle design.
Note: packages/utils/src/voice/voiceSessionManager.ts is a 4th connect/
destroy path but is entirely dead code (zero references).

FINAL REVIEW returned 15 findings + 6 deferred items. Connor: "get them all
done". Fixing in five batches, then one whole-branch re-review:
A: F2 rot-signal timing, F3 resolutionPath on primary paths, F12 outcome
vocabulary (apps/rainbot/src/voice/\*)
B: F1 command root span, deferred#4 dotenv order (apps/raincloud)
C: F4 duplicate runtime instr, F5 .env.example, F6 diag once-only,
F13 SIGTERM flush, F14 pin instrumentation-winston (observability)
D: F7 voice.join duration-to-Ready, F8 raincloud worker-health gauge,
F9 sound cardinality, F10 phase rename, F11 health-poll noise
E: F15 queue attrs, deferred 1/2/3/5/6

Batch C: complete (packages/observability/src/node/sdk.ts + .env.example).
F4: removed the explicit `new RuntimeNodeInstrumentation()` — verified in
node*modules that the auto-instrumentations bundle already carries it and
only excludes instrumentation-fs by default, so it was double-registered.
F14: pinned `instrumentation-winston: { disableLogSending: true }` next to
the fs entry; confirmed it's only inert today because
@opentelemetry/winston-transport isn't resolvable — an accident, not a
guarantee.
F6: new diagLogger.ts wraps DiagConsoleLogger so each distinct
(level, message) is emitted once per process; first occurrence always
gets through. Mutation-checked in diagLogger.test.ts.
F13: shutdownTelemetry() is now internally bounded (5s race). Wired into
SIGTERM/SIGINT for the three TS workers via worker-shared's
setupProcessErrorHandlers (they had zero prior signal handling — Node's
default applied). Raincloud already owns SIGINT/SIGTERM via its own
gracefulShutdown(); added the flush as one more awaited step there instead
of a second competing listener pair. Both paths gate on
isTelemetryStarted() so OTEL_SDK_DISABLED=true stays a true no-op —
workers skip attaching the listeners entirely (Node suppresses default
signal behavior once \_any* listener exists, so a no-op handler would have
made the disabled case worse, not neutral).
F5: added an OpenTelemetry section to .env.example. Resolved the
OTEL_SERVICE_NAME question by documenting it as intentionally inert —
each service's hardcoded name must stay in sync with its identity
elsewhere (dashboards, worker registration), so letting the env var win
would be a correctness risk, not a fix.
yarn validate green (26/26 tasks). New tests: diagLogger.test.ts (4),
sdk.test.ts +1 (bounded-shutdown-under-hang), processErrorHandlers.test.ts
+4 (signal-gated-on-telemetry, SIGTERM/SIGINT flush+exit, exit-despite-
rejected-flush).

FIX WAVE complete (commits 3d8f612..8d2235d, 6 commits).
Verification review found one Important regression introduced BY the F2 fix:
the post-race subprocess.catch() fired on any non-zero exit after 4s, and
normal skip/stop kills yt-dlp via EPIPE — so every /skip incremented the rot
counter, and signal-kills (exitCode null) re-emitted the bare
'ChildProcessError' that F12 existed to remove. Fixed with a stream_closed
outcome excluded from the failure counter, proven with real subprocesses.
All F1-F15 and all 6 deferred items resolved.
Remaining for Connor by hand: delete packages/utils/src/voice/
voiceSessionManager.ts (dead code, annotated; agent file deletion is
sandbox-blocked).
Task 12 (deploy) NOT done — needs Connor's approval.
Note for Task 12: drop OTEL_SERVICE_NAME from the env step; it is inert by
design and now documented as such in .env.example.

Task 1 (rainbot service rename): complete (commit b9cb357, review clean).
Implementer dropped the brief-specified jest.isolateModules (broken as written); reviewer
empirically confirmed the deviation was necessary and that the tests fail on a wrong name.
LEFTOVER for Connor: delete the untracked review probe at
apps/rainbot/src/**tests**/\_isolate_probe.test.ts (neutered to it.todo; agent file deletion
is sandbox-blocked).
Spawned side task: ui/package.json duplicate type-check key (pre-existing).

Task 2 (spanmetrics connector, telemetry repo): complete (commits 2b0fa6f..59fccb6, PR #13,
review clean). Extra beyond brief, both judged necessary: f-string SyntaxError fix in the
assertion, and config.postgres.yaml metrics.receivers override needed spanmetrics too
(collector --config merges replace lists wholesale).
MINOR findings deferred to final review, both plan-mandated values:
M1 validate-stack.sh checks filter/rainbot-spans by NAME only, never its OTTL condition -
a neutered regex would pass CI while defeating the tenant filter.
M2 metrics_flush_interval 30s vs Prometheus 15s scrape - every second scrape returns
identical values; 15s would match cadence.

Task 3 (tempo service-graph generator + prometheus remote-write receiver): complete
(commits 91e39d6..7adc057, review clean, no findings).
Noted: telemetry README still says the stack is "not deployed there yet" - stale, it is
live on Dokploy. Candidate doc fix at the end.

Task 4 (overview.json + datasource-uid assertion): complete (commits a284a60..e0274ac after
one fix wave, review clean).
Fix wave: panel 7 grouped the RPC histogram by rainbot_outcome, a label that metric never
carries (plan defect, corrected in spec+plan at 11295d0); now span-metric status_code on the
worker.rpc span. Also fixed validate-stack.sh racing Grafana async provisioning - it now polls
for the expected dashboard set.
MINOR deferred to final review: datasource-uid assertion only walks top-level panels (a
collapsed row panel nests its own) and only dict-shaped datasource refs (legacy string refs
skipped silently).

Task 5 (playback.json): complete (commits 0694854..ec613a9, review clean, no findings).
Pre-dispatch correction: plan panel 6 queried an invented span_name "track.stream"; real span is
audio.resource.create (3 call sites in apps/rainbot/src/voice/audioResource.ts).
Task 6 pre-dispatch: plan "Top sounds" panel grouped the sound-play histogram by rainbot_sound,
which both call sites deliberately omit (user-uploaded R2 key, ~14 bucket series per value, kept
on the sound.play span instead). Connor chose: drop the bar chart, show soundboard volume plus a
Tempo Explore link for per-sound ranking. Docs corrected.

Task 6 (usage.json): complete (commits 3776725..a2cf74c after one fix wave, re-review running).
Fix wave: the nodeGraph panel queried Prometheus directly, which cannot render - Grafana needs
nodes/edges frames with id/source/target. Now a Tempo serviceMap query, which also required
adding jsonData.serviceMap.datasourceUid to the Tempo datasource (absent before, silently
useless without it).
MINOR deferred to final review: panel 2 barchart rendering of an instant topk has no in-repo
precedent; only confirmable in a live Grafana.

Task 6 re-review: clean, approved. All implementation tasks (1-6) complete and reviewed.
Remaining: Task 7 (deploy + live verification) - needs Connor for Dokploy env + Discord traffic.

FINAL WHOLE-BRANCH REVIEW (opus): do-not-ship, 3 must-fixes, all telemetry-side.
MF1 services/tempo/config.yaml used ${env:VAR} (collector syntax); Tempo 2.6 uses drone/envsubst
${VAR}, so the generator remote-wrote to http://:9090 with no error and CI still passed.
MF2 usage.json panel 2 barchart fed by instant time_series query - no string field, no categories.
MF3 serviceMap query was unfiltered, so the rainbot board rendered cashflow topology.
Fix wave applied in 9 commits 92c49b7..c104f48, CI green; plus 8 should-fixes (rainbot.sound added
to the banned-dimension set, OTTL condition asserted exactly, datasource check recurses, health
excluded from the p95 panel, error-rate stat gets thresholds, rainbot.track_source added as a span
dimension because the resolve histogram hardcodes youtube, README staleness + Prometheus
remote-write security note).
Outstanding: serviceMapQuery field spelling unconfirmed without a live Grafana; title corrections
in flight.
