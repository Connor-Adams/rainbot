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
