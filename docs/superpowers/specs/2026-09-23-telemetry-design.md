# Telemetry for Rainbot

**Date:** 2026-09-23
**Status:** Approved, not implemented

Rainbot has no instrumentation. A self-hosted observability stack already runs
on the same Dokploy box — `otel-collector`, `tempo`, `prometheus`, `loki`,
`grafana`, in the `Telemetry` project — and cashflow already feeds it. This
spec wires all four bots and the dashboard into it.

## Why this shape

The collector accepts OTLP over HTTP on `:4318` and gRPC on `:4317`, exports
logs to Loki, traces to Tempo, and exposes metrics on `:9464` for Prometheus to
scrape. Its config carries an explicit constraint, from the telemetry repo:

> the OTLP receivers below are UNAUTHENTICATED. The `cors.allowed_origins` list
> is browser-enforced only — curl / any OTLP SDK / a compromised container
> ignores CORS and the collector accepts the POST. [...] If browser OTLP is
> ever needed, proxy it through an authenticated backend endpoint — never
> expose 4318/4317 publicly.

So the collector stays internal and browser telemetry is proxied through
raincloud. That is the single most constraining decision in this design.

Auto-instrumentation alone would be close to worthless here. Three of the four
services are Discord gateway clients with no inbound HTTP beyond health probes;
their work is voice connections, audio extraction and RPC. The value is in the
domain spans, not the framework ones.

## Package layout

New workspace `packages/observability`, published as `@rainbot/observability`
with three subpath exports so browser and node never share a dependency graph:

| export                           | contents                                                                                           |
| -------------------------------- | -------------------------------------------------------------------------------------------------- |
| `@rainbot/observability/node`    | SDK bootstrap, OTLP trace + metric exporters, auto-instrumentations, runtime metrics, span helpers |
| `@rainbot/observability/browser` | Web SDK, document-load and fetch instrumentation, error capture                                    |
| `@rainbot/observability/semconv` | Attribute name constants shared by both                                                            |

`@rainbot/shared` already ships a dual CJS+ESM build (`tsconfig.esm.json`) for
the ESM UI; `observability` follows that pattern. The `browser` subpath must not
transitively import any `node`-only package — Vite resolves the subpath
directly, so the node SDK never enters the browser bundle.

`observability` depends on no other `@rainbot/*` package, so it sits at the
same build-order level as `protocol` — it must build before `utils` and
`worker-shared`, which will import it for their loggers.

### `semconv`

Attribute names are defined once and imported by both sides so a browser span
and a bot span describe the same guild with the same key:

```
rainbot.guild_id      rainbot.user_id       rainbot.worker
rainbot.sound         rainbot.track_url     rainbot.track_source
rainbot.voice_channel rainbot.queue_length  rainbot.extraction_path
```

## Initialisation

OpenTelemetry's auto-instrumentation patches modules as they are required, so
the bootstrap must execute before anything else imports `http`, `redis`, `pg`
or `express`.

- **raincloud** — `require('@rainbot/observability/node')` becomes the first
  statement in `apps/raincloud/index.js`, above the `Module._resolveFilename`
  monkeypatch.
- **workers** — first import in `apps/{rainbot,pranjeet,hungerbot}/src/index.ts`.

Getting this wrong degrades silently: spans still emit, but HTTP and Redis
calls are missing from them. The implementation plan must include a check that
auto-instrumented spans actually appear, not just that the SDK starts.

## Signals

### Traces

Auto-instrumented: express and http on raincloud, redis on raincloud and
pranjeet, pg on raincloud.

Domain spans, with the attributes that make them worth having:

| span                    | service                                  | attributes                                                                       |
| ----------------------- | ---------------------------------------- | -------------------------------------------------------------------------------- |
| `voice.join`            | all four                                 | guild, voice channel, state transitions, duration to `ready`                     |
| `track.resolve`         | rainbot, raincloud                       | track url, source, extraction path, whether a proxy was used, yt-dlp exit status |
| `audio.resource.create` | rainbot, raincloud                       | stream type, whether ffmpeg transcoding was needed                               |
| `queue.mutate`          | rainbot, raincloud                       | operation, queue length before/after, lock wait time                             |
| `worker.rpc`            | raincloud (client), all workers (server) | procedure, worker, outcome                                                       |
| `sound.play`            | hungerbot                                | sound key, R2 fetch duration, sniffed content type                               |
| `tts.speak`             | pranjeet                                 | provider, voice, character count                                                 |
| `grok.converse`         | pranjeet                                 | model, thread continuity, token counts                                           |

`queue.mutate` wraps the existing `withQueueLock` rather than adding a second
locking path — the lock wait time is a signal in its own right.

### Metrics

Pushed as OTLP to the collector, which re-exposes them for Prometheus.

- Runtime: event-loop lag, heap, GC — via
  `@opentelemetry/instrumentation-runtime-node`, all four services
- `rainbot.voice.connections` — gauge, per guild and service
- `rainbot.track.resolve.duration` — histogram, by source and outcome
- `rainbot.track.resolve.failures` — counter, by source and error class.
  This is the yt-dlp rot signal; it should trend visibly before playback breaks.
- `rainbot.worker.rpc.duration` — histogram, by procedure and worker
- `rainbot.worker.registered` — gauge, 0/1 per worker. Workers retry
  registration four times then give up permanently, so a stuck 0 is actionable.
- `rainbot.sound.play.duration` — histogram, split R2 fetch vs playback

### Logs

Both logger modules — `packages/utils/src/logger.ts` and
`packages/shared/src/logger.ts` — gain an OTLP transport alongside their
existing Winston transports. The transport attaches `trace_id` and `span_id`
from the active context so Grafana links a log line to its trace.

Console output is unchanged; Dokploy's log view keeps working exactly as it
does today.

## Browser telemetry

The dashboard loads `@rainbot/observability/browser`, which exports OTLP over
HTTP to `${VITE_AUTH_BASE_URL}/v1/traces` rather than to the collector.

Raincloud gains a route that:

1. requires an authenticated session (same middleware as `/api/*`)
2. rate-limits per session
3. forwards the body verbatim to `${OTEL_EXPORTER_OTLP_ENDPOINT}/v1/traces`

The collector gains no public exposure and the telemetry repo needs no change.

Three seams in the UI make this produce useful data:

- `ErrorBoundary.componentDidCatch` currently only calls `console.error`. It
  records an exception on the active span instead — this is the class of bug
  that made the login button silently do nothing.
- The `api` axios instance has no interceptors. It gets one, creating a span
  per request and propagating `traceparent`, so a dashboard click links to the
  raincloud span serving it.
- `useMutation` calls in PlayerTab, SoundboardTab and AdminTab are anonymous.
  Each gets a `mutationKey` so spans read `play sound` rather than `POST /api/…`.

## Configuration

| variable                      | services      | value                                                |
| ----------------------------- | ------------- | ---------------------------------------------------- |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | all four bots | `http://telemetry-otel-collector-wyuddq-c1orqh:4318` |
| `OTEL_SERVICE_NAME`           | all four bots | `raincloud` / `rainbot` / `pranjeet` / `hungerbot`   |
| `OTEL_SDK_DISABLED`           | local dev     | `true`                                               |

Dokploy Applications resolve each other by generated `appName` across projects
on `dokploy-network`, which is how the bots reach the Telemetry project.

The browser needs no new environment variable: it posts to
`VITE_AUTH_BASE_URL`, which it already reads at runtime, and its service name
(`rainbot-ui`) is a constant in the browser bootstrap rather than config —
there is only ever one dashboard build.

## Failure behaviour

Telemetry must never take the bots down.

- Exporter failures are logged once at `warn` and dropped. The OTLP exporters
  retry with backoff internally; no unbounded queue.
- `OTEL_SDK_DISABLED=true` skips bootstrap entirely, so a broken collector is
  always one env var from being out of the path.
- The Winston OTLP transport swallows its own errors — a logging transport that
  throws inside an error handler is how you lose the original error.
- The browser proxy route returns 202 and forwards asynchronously; a slow
  collector must not slow the dashboard.

## Testing

- Unit: the Winston transport attaches trace context when a span is active and
  omits it cleanly when none is; the proxy route rejects unauthenticated
  requests and rate-limits authenticated ones.
- Unit: span helpers set the attributes named in `semconv` — the names are the
  contract with Grafana dashboards, so a typo is a silent failure.
- Integration: bootstrap with an in-memory span exporter, exercise one domain
  operation per service, assert the expected span tree.
- Manual, once deployed: play a track and confirm a single trace spans
  raincloud → worker RPC → rainbot → track resolve, with logs correlated.

## Out of scope

Grafana dashboards and alert rules. Emit the signals first, then build views
against real data rather than guessing at thresholds.

Also out of scope, tracked separately: the volume controls bug, YouTube control
UX, the soundboard sound-menu, the dashboard information-architecture rework,
and adding a brand axis to `@connor-adams/designsystem`.
