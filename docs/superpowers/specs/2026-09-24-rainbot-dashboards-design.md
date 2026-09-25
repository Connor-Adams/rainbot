# Rainbot Grafana Dashboards

Rainbot has shipped traces, metrics and logs to the shared Dokploy telemetry stack since
2026-09-24 (see [2026-09-23-telemetry-design.md](2026-09-23-telemetry-design.md)), but nothing
reads them: `grafana.rainbot.win` has folders for `cashflow` and `homelab` and none for rainbot.
This spec adds a `rainbot` dashboard folder covering three questions — is it healthy, why did
playback break, what is being used — plus the span-metrics plumbing the third question needs.

Work spans two repositories. The dashboards and stack config live in `Connor-Adams/telemetry`;
one small rename lands in `Connor-Adams/rainbot`.

## Verified starting state

Queried live through the Grafana datasource proxy on 2026-09-24. Every design choice below rests
on this, so it is recorded rather than assumed.

| Fact                    | Value                                                                                                                                          |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Prometheus `job` values | `raincloud`, `rainbot`, `pranjeet`, `hungerbot` — bare, because `honor_labels: true` passes `service.name` through                             |
| Live `rainbot_*` names  | `rainbot_worker_registered`, `rainbot_worker_orchestrator_healthy`, `rainbot_worker_rpc_duration_milliseconds_{bucket,count,sum}` (168 series) |
| Absent metric names     | `voice_connections`, `track_resolve_duration`, `track_resolve_failures`, `sound_play_duration` — lazy instruments, never yet recorded          |
| Histogram naming        | unit `ms` becomes a `_milliseconds` infix                                                                                                      |
| Loki labels             | `job`, `level` (uppercase, e.g. `WARN`), `service_name`, `detected_level`; all four services present                                           |
| Log → trace             | Works. Lines carry both a top-level `"traceid"` and `attributes.trace_id`; both `derivedFields` regexes match                                  |
| Tempo                   | All four services present; only dashboard HTTP spans so far                                                                                    |
| Scrapes                 | `up=1` for `otel-collector` and `otel-collector-self`                                                                                          |

A metric that has never fired does not exist in Prometheus. The absent names above are idleness,
not breakage.

## Service rename

The stack's Prometheus runs `honor_labels: true` specifically so `service.name` becomes the `job`
label; its own comment anticipates `job="rainbot-raincloud"`. Rainbot passes bare names, so today
`job="rainbot"` means the **music worker**, and none of the four services is qualified by tenant on
a stack shared with cashflow and homelab.

Rename the four `startTelemetry()` arguments:

| Call site                         | Old         | New                 |
| --------------------------------- | ----------- | ------------------- |
| `apps/raincloud/index.js`         | `raincloud` | `rainbot-raincloud` |
| `apps/rainbot/src/telemetry.ts`   | `rainbot`   | `rainbot-rainbot`   |
| `apps/pranjeet/src/telemetry.ts`  | `pranjeet`  | `rainbot-pranjeet`  |
| `apps/hungerbot/src/telemetry.ts` | `hungerbot` | `rainbot-hungerbot` |

`.env.example`'s OpenTelemetry block names all four and must follow. The names also appear in
assertions under `packages/observability/src/node/__tests__/` and
`apps/raincloud/__tests__/telemetry-import-order.test.ts` — the rename is not complete until
`yarn validate` passes.

Consequence, accepted: Prometheus series, Loki `service_name` and Tempo `service.name` all change
value, so the pre-rename data (one day of it) is discontinuous with everything after. Every query
in this spec targets the **new** names.

## Span metrics

Command-level usage exists only as spans. Tempo has no `metrics_generator` today and Grafana has no
Postgres datasource, so there is no time series for "commands per hour by name". Both producers get
enabled, with split responsibilities so neither duplicates the other's series.

### Collector connector — owns span metrics

`services/otel-collector/config.yaml`. The contrib image (0.110.0) already has the connector.

```yaml
connectors:
  spanmetrics:
    namespace: rainbot.span
    metrics_flush_interval: 30s
    histogram:
      explicit:
        buckets: [10ms, 50ms, 100ms, 500ms, 1s, 2s, 5s, 10s, 30s]
    dimensions:
      - name: rainbot.command_name
      - name: rainbot.outcome
      - name: rainbot.worker
      - name: rainbot.rpc_procedure
      - name: rainbot.stream_type
      - name: rainbot.resolution_path
```

Deliberately absent: `rainbot.guild_id`, `rainbot.user_id`, `rainbot.track_url`. Unbounded label
values in Prometheus are the one mistake here that is expensive to undo.

**The collector is shared.** Feeding the whole traces pipeline into the connector would generate
span metrics for cashflow too, where `span.name` is per-route and per-`pg.query` — a cardinality
problem for another tenant caused by a rainbot change. So the connector is fed by its own pipeline
behind a filter:

```yaml
processors:
  filter/rainbot-spans:
    error_mode: ignore
    traces:
      span:
        - 'not IsMatch(resource.attributes["service.name"], "^rainbot-")'

service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [memory_limiter, batch]
      exporters: [otlphttp/tempo]
    traces/spanmetrics:
      receivers: [otlp]
      processors: [memory_limiter, filter/rainbot-spans, batch]
      exporters: [spanmetrics]
    metrics:
      receivers: [otlp, spanmetrics]
      processors: [memory_limiter, batch]
      exporters: [prometheus]
```

The filter's `span` condition drops what matches, hence the negated match. Output reaches Grafana
through the existing `prometheus` exporter on `:9464` — no new scrape, no new flag.

Resulting series: `rainbot_span_calls_total` and `rainbot_span_duration_milliseconds_bucket`, with
the connector's default dimensions (`service_name`, `span_name`, `span_kind`, `status_code`) plus
the allowlist above.

### Tempo generator — service graphs only

`services/tempo/config.yaml`, `span-metrics` deliberately **not** enabled:

```yaml
metrics_generator:
  registry:
    external_labels:
      source: tempo
  storage:
    path: /var/tempo/generator/wal
    remote_write:
      - url: http://${env:PROMETHEUS_HOST}:9090/api/v1/write
        send_exemplars: true

overrides:
  defaults:
    metrics_generator:
      processors: [service-graphs]
```

Prerequisite: `services/prometheus/entrypoint.sh` does **not** pass
`--web.enable-remote-write-receiver` today. Without it Tempo's remote-write silently fails and the
generator produces nothing. Prometheus v2.55.1 supports the flag.

`PROMETHEUS_HOST` follows the existing `LOKI_HOST` / `TEMPO_HOST` convention in the collector
config and must be declared wherever those are documented.

Service graphs are Tempo-wide, so cashflow gets them too. That is bounded by service-pair count and
is the accepted cost of the node-graph panel.

## Dashboards

Three files under `services/grafana/provisioning/dashboards/rainbot/`. The existing provider has
`foldersFromFilesStructure: true`, so the directory becomes the folder with no config change, and
`allowUiUpdates: false`, so JSON is the only authoring path — UI edits are discarded.

### Conventions

Matching the cashflow boards: `"editable": false`, `"graphTooltip": 1`, datasource UIDs `prometheus`
/ `loki` / `tempo`, a `links` header carrying a dashboards dropdown plus prebuilt Explore links, and
stable `uid` values (`rainbot-overview`, `rainbot-playback`, `rainbot-usage`) so links and bookmarks
survive.

The boards are fleet-wide by default: metric panels match `job=~"rainbot-.*"` and log panels match
`service_name=~"rainbot-.*"`, so nothing is hidden behind a variable selection. Two exceptions pin a
value explicitly because the metric only exists there: the orchestrator-health gauge
(`job="rainbot-raincloud"`) and the music-worker log panel (`service_name="rainbot-rainbot"`).

Span-metric panels are the exception to the `job` convention: the connector carries the emitter as
its own `service_name` dimension, so those queries select on `span_name` (and `service_name` where
it narrows) rather than `job`. Whether the prometheus exporter _also_ derives a `job` label for
connector output is listed under "Unverified".

No template variables. A `$service` picker was considered and dropped — with four services the
fleet-wide view fits on screen, and a variable would only add a way to be looking at the wrong
subset while debugging. Per-service drilldown is the Explore links in the header.

### `overview.json` — is it healthy

| Panel                | Query                                                                                                                                                                 |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Collector scrape     | `up{job="otel-collector"}`                                                                                                                                            |
| Worker self-report   | `rainbot_worker_registered` by `rainbot_worker`                                                                                                                       |
| Orchestrator belief  | `rainbot_worker_orchestrator_healthy{job="rainbot-raincloud"}` by `rainbot_worker`                                                                                    |
| Voice connections    | `sum(rainbot_voice_connections)`, and `sum by (job) (rainbot_voice_connections)`                                                                                      |
| RPC p95 by procedure | `histogram_quantile(0.95, sum by (le, rainbot_rpc_procedure) (rate(rainbot_worker_rpc_duration_milliseconds_bucket[5m])))`                                            |
| RPC outcome rate     | `sum by (status_code) (rate(rainbot_span_calls_total{span_name="worker.rpc"}[$__rate_interval]))` — NOT the RPC histogram, which carries no outcome label (see below) |
| Error log rate       | `sum by (service_name) (rate({service_name=~"rainbot-.*", level="ERROR"}[5m]))`                                                                                       |
| Recent errors (logs) | `{service_name=~"rainbot-.*", level=~"ERROR\|WARN"}`                                                                                                                  |

The two worker panels sit side by side on purpose: `rainbot_worker_registered` is each worker's
own boot-time self-report with no heartbeat, while `rainbot_worker_orchestrator_healthy` is
raincloud's circuit-breaker view. They disagree exactly when raincloud has restarted and lost its
registry while a worker's stale `1` persists — that disagreement is the signal, and it is only
visible if both are on screen together. Workers retry registration four times and then give up
permanently, so a stuck `0` never self-heals.

**Correction (found in review of this task).** Panel 7 originally read
`sum by (rainbot_outcome) (rate(rainbot_worker_rpc_duration_milliseconds_count[...]))`, which is
wrong: `rainbot.worker.rpc.duration` is recorded at one call site (`packages/rpc/src/client.ts`)
with `rainbot.rpc_procedure` and `rainbot.worker` only, and `rainbot.outcome` is used solely on the
track-resolve paths. That query does not return No data — it collapses to one flat series with a
blank legend, which is worse. RPC success/failure lives in the span-metrics family instead: the
client span is named `worker.rpc` and the connector emits `status_code` by default. The panel now
queries that, and carries a description saying why the histogram cannot answer it.

A Node runtime row (event loop, heap) is deferred to the follow-up in "Unverified", since the
runtime-node instrumentation's exact metric names have not been observed on this stack.

### `playback.json` — why did playback break

| Panel                     | Query                                                                                                                                                                            |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Resolve latency by path   | `histogram_quantile(0.95, sum by (le, rainbot_extraction_path) (rate(rainbot_track_resolve_duration_milliseconds_bucket[5m])))`, repeated for 0.5 / 0.99                         |
| Resolve latency by source | `histogram_quantile(0.95, sum by (le, rainbot_track_source) (rate(rainbot_track_resolve_duration_milliseconds_bucket[5m])))`                                                     |
| Failures by class         | `sum by (rainbot_outcome, rainbot_track_source) (rate(rainbot_track_resolve_failures_total[15m]))`                                                                               |
| Failure ratio             | `sum(rate(rainbot_track_resolve_failures_total[1h])) / (sum(rate(rainbot_track_resolve_failures_total[1h])) + sum(rate(rainbot_track_resolve_duration_milliseconds_count[1h])))` |
| Stream shape              | `sum by (rainbot_stream_type, rainbot_resolution_path) (rate(rainbot_span_calls_total{span_name="audio.resource.create"}[15m]))`                                                 |
| Soundboard phases         | `sum by (rainbot_phase) (rate(rainbot_sound_play_duration_milliseconds_count[15m]))`                                                                                             |
| Music worker logs         | `{service_name="rainbot-rainbot", level=~"ERROR\|WARN"}`                                                                                                                         |
| Resolve traces            | TraceQL `{resource.service.name="rainbot-rainbot" && name="track.resolve"}`                                                                                                      |

The failure counter is the yt-dlp rot signal the code comments call out: it should trend up before
playback fails outright, which makes the ratio panel the one to watch between weekly image rebuilds.

### `usage.json` — what is being used

| Panel                     | Query                                                                                                                                     |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Commands per hour         | `sum by (rainbot_command_name) (rate(rainbot_span_calls_total{span_name="command.execute"}[1h]))`                                         |
| Commands over range       | `topk(15, sum by (rainbot_command_name) (increase(rainbot_span_calls_total{span_name="command.execute"}[$__range])))`                     |
| Command failures          | `sum by (rainbot_command_name) (rate(rainbot_span_calls_total{span_name="command.execute", status_code="STATUS_CODE_ERROR"}[1h]))`        |
| Soundboard plays per hour | `sum(rate(rainbot_sound_play_duration_milliseconds_count{rainbot_phase="dispatch"}[$__rate_interval])) * 3600` — NOT per sound, see below |
| Tracks by source          | `sum by (rainbot_track_source) (increase(rainbot_track_resolve_duration_milliseconds_count[$__range]))`                                   |
| Service graph             | `traces_service_graph_request_total` (node graph panel)                                                                                   |

**Per-sound counts are deliberately not metrics.** `rainbot.sound` is a user-uploaded R2 object key,
and both `recordSoundPlay` call sites (`apps/hungerbot/src/handlers/rpc.ts`,
`packages/worker-shared/src/voiceRpcHandlers.ts`) carry a comment explaining why it is kept off the
histogram: each distinct value costs ~14 bucket series that are never reclaimed as sounds
accumulate. It stays a span attribute on the `sound.play` span, where cardinality is free. So the
usage board shows soundboard volume only, and links to Explore for the ranking: TraceQL
`{name="sound.play"}`, inspected by `rainbot.sound` in Tempo. Connor chose this over adding the
dimension (2026-09-24).

Note on command failures: `command.execute` spans are only marked ERROR when the handler throws.
Several commands catch internally and reply with an error embed, so this panel undercounts
user-visible failures — a known blind spot inherited from the instrumentation, documented in
`apps/raincloud/src/events/interactionCreate.js`.

Grok token spend stays out. The counts are span attributes (`rainbot.grok_*_tokens`) and would need
either a dimension per token field or a real counter; neither is worth it before someone asks.

## Unverified queries

Written from declared instrument names and the OTel-to-Prometheus conversion rules, because the
bots have been idle since the deploy and these signals have never fired. Each must be confirmed
once real traffic exists; the checklist is part of implementation, not a follow-up ticket.

1. `_total` suffix on `rainbot_track_resolve_failures` — counter suffixing is the collector's doing,
   not observed here yet.
2. Label values for `rainbot_track_source`, `rainbot_extraction_path`, `rainbot_outcome` and
   `rainbot_phase`.
3. RESOLVED before implementation: the stream-shape span is `audio.resource.create` (three call
   sites in `apps/rainbot/src/voice/audioResource.ts`); `track.stream` never existed.
4. Dimension label sanitisation — `rainbot.command_name` is expected to arrive as
   `rainbot_command_name`.
5. `status_code` values emitted by the connector (`STATUS_CODE_ERROR` assumed).
6. Node runtime metric names, before adding the deferred overview row.
7. Whether the prometheus exporter derives a `job` label for spanmetrics-connector output, or only
   the connector's own `service_name` dimension survives.
8. That `worker.rpc` is the span name the connector actually sees, and that `status_code` carries
   distinguishable values on it — the overview's RPC outcome panel depends on both.

## Validation

- `services/prometheus/entrypoint.sh --render-only` still renders (an existing test path).
- Dashboard JSON parses, and every `datasource.uid` is one of `prometheus` / `loki` / `tempo`.
- After deploy: each panel queried through the datasource proxy returns series, or is listed above
  as awaiting traffic. No panel ships in an unexplained "No data" state.
- `rainbot_span_calls_total` carries only `service_name` values matching `^rainbot-` — proof the
  filter is containing the connector to this tenant.
- Cashflow's eight dashboards still render (the collector's traces pipeline changed shape).
- `yarn validate` in rainbot for the rename.

## Out of scope

- Alert rules. Thresholds would be guesses with no observed baseline. Note for whoever revisits
  this: the stack's GitHub-issue contact point delivers nothing today, because
  `GITHUB_DISPATCH_TOKEN` is unset by choice — rules evaluate and show state in the Grafana UI
  only. So the cost of a bad threshold is currently low, but it becomes real the moment that token
  is set. Revisit after a week of real data.
- Dokploy container and host metrics (CPU, memory, restarts, Swarm task state). No exporter feeds
  them today; that is its own piece of work.
- Other tenants' gaps, including homelab's missing boards.
- The stray unprovisioned "New dashboard" in Grafana's root folder — untouched, outside
  provisioning.
- UI (browser) telemetry. Rainbot's frontend emits nothing, and giving it an OTLP path is a
  separate design.
