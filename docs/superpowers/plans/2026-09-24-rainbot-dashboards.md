# Rainbot Grafana Dashboards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give rainbot a provisioned Grafana dashboard folder — health, playback drilldown, usage — on the shared Dokploy telemetry stack, plus the span-metrics plumbing usage needs.

**Architecture:** Rainbot's four services are renamed to `rainbot-*` so `service.name` reads as a tenant-qualified identity in all three signals. The shared otel-collector gains a `spanmetrics` connector on its own filtered traces pipeline (rainbot spans only, so cashflow's cardinality is untouched), and Tempo's `metrics_generator` is enabled for service graphs only. Three dashboard JSON files land in the telemetry repo's `rainbot/` tenant directory, which the existing provider auto-folders.

**Tech Stack:** OpenTelemetry Collector contrib 0.110.0, Tempo 2.6.0, Prometheus v2.55.1, Grafana 11.3.0, Loki 3.2.0, provisioned dashboard JSON (schemaVersion 39), Node 22 / Yarn 4 / ts-jest in rainbot.

**Spec:** [docs/superpowers/specs/2026-09-24-rainbot-dashboards-design.md](../specs/2026-09-24-rainbot-dashboards-design.md)

## Global Constraints

- Two repositories. Tasks 1 lands in `Connor-Adams/rainbot` (this worktree). Tasks 2–6 land in `Connor-Adams/telemetry` at `~/Developer/telemetry`. Task 7 spans both plus Dokploy.
- **There is no local Docker on this machine.** Every container check in the telemetry repo runs only in the GitHub Actions `validate` job (`.github/workflows/build-images.yml` → `scripts/validate-stack.sh`). The test cycle for Tasks 2–6 is: commit, push the branch, read the CI run. Do not claim a config validates without a green `validate` job.
- Image tags are pinned and must not change: collector `otel/opentelemetry-collector-contrib:0.110.0`, `grafana/tempo:2.6.0`, `prom/prometheus:v2.55.1`, `grafana/grafana:11.3.0`, `grafana/loki:3.2.0`.
- Dashboard JSON conventions, copied from the cashflow boards: `"schemaVersion": 39`, `"editable": false`, `"graphTooltip": 1`, `"id": null`, `"version": 1`, `"timezone": "browser"`, `"refresh": "30s"`, datasource objects of the form `{"type": "prometheus", "uid": "prometheus"}` (likewise `loki`, `tempo`), and `$__rate_interval` in every `rate()` window.
- Span-metric dimensions must never include `rainbot.guild_id`, `rainbot.user_id`, or `rainbot.track_url`. Unbounded label values in Prometheus are not reversible without dropping series.
- Prometheus label names for rainbot metric attributes use underscores: the attribute `rainbot.command_name` becomes the label `rainbot_command_name`.
- In rainbot, `yarn validate` (type-check + format:check + test) is the definition of done. There is no root lint script. Tests import `@rainbot/*` from `dist/`, so run `yarn build:ts` before invoking a single workspace's tests directly.
- Commit messages: Conventional Commits. No `Co-Authored-By` or other attribution trailers.

---

### Task 1: Rename rainbot's services to `rainbot-*`

Repository: `Connor-Adams/rainbot` (this worktree, branch `claude/rainbot-otel-telemetry-3351c9`).

Why: the stack's Prometheus runs `honor_labels: true`, so `service.name` becomes the `job` label directly. Today the four bare names are unqualified on a stack shared with cashflow and homelab, and `job="rainbot"` means the music worker rather than the project.

**Files:**

- Modify: `apps/raincloud/index.js:19`
- Modify: `apps/rainbot/src/telemetry.ts:7`
- Modify: `apps/pranjeet/src/telemetry.ts:7`
- Modify: `apps/hungerbot/src/telemetry.ts:7`
- Modify: `.env.example` (the `OTEL_SERVICE_NAME` note names all four services)
- Create: `apps/rainbot/src/__tests__/telemetry-service-name.test.ts`
- Create: `apps/pranjeet/src/__tests__/telemetry-service-name.test.ts`
- Create: `apps/hungerbot/src/__tests__/telemetry-service-name.test.ts`
- Modify: `apps/raincloud/__tests__/telemetry-import-order.test.ts` (add a source assertion)

**Interfaces:**

- Consumes: `startTelemetry(serviceName: string): void` from `@rainbot/observability/node`.
- Produces: the four resource identities every query in Tasks 4–6 depends on — `rainbot-raincloud`, `rainbot-rainbot`, `rainbot-pranjeet`, `rainbot-hungerbot`. These appear as the Prometheus `job` label, the Loki `service_name` label, and Tempo's `service.name`.

- [ ] **Step 1: Write the failing test for the music worker**

Create `apps/rainbot/src/__tests__/telemetry-service-name.test.ts`:

```typescript
/**
 * The service name is not cosmetic: the telemetry stack's Prometheus scrape
 * runs honor_labels: true, so this string becomes the `job` label, the Loki
 * `service_name` label, and Tempo's service.name. Every provisioned rainbot
 * dashboard query matches on `rainbot-*`, so a rename here silently empties
 * those panels. Hence a test on the literal.
 */
jest.mock('@rainbot/observability/node', () => ({
  startTelemetry: jest.fn(),
}));

describe('worker telemetry bootstrap', () => {
  it('starts telemetry under the tenant-qualified service name', () => {
    jest.isolateModules(() => {
      require('../telemetry');
    });

    const { startTelemetry } = require('@rainbot/observability/node');
    expect(startTelemetry).toHaveBeenCalledWith('rainbot-rainbot');
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

```bash
yarn build:ts && yarn workspace @rainbot/rainbot-worker test src/__tests__/telemetry-service-name.test.ts
```

Expected: FAIL — `expected "rainbot-rainbot", received "rainbot"`.

- [ ] **Step 3: Rename the music worker**

In `apps/rainbot/src/telemetry.ts`, change the call to:

```typescript
startTelemetry('rainbot-rainbot');
```

- [ ] **Step 4: Run it and confirm it passes**

```bash
yarn workspace @rainbot/rainbot-worker test src/__tests__/telemetry-service-name.test.ts
```

Expected: PASS.

- [ ] **Step 5: Repeat for pranjeet**

Create `apps/pranjeet/src/__tests__/telemetry-service-name.test.ts` with the file from Step 1, with `'rainbot-rainbot'` replaced by `'rainbot-pranjeet'`. Run it (`yarn workspace @rainbot/pranjeet-worker test src/__tests__/telemetry-service-name.test.ts`), confirm FAIL, then change `apps/pranjeet/src/telemetry.ts` to `startTelemetry('rainbot-pranjeet');` and confirm PASS.

- [ ] **Step 6: Repeat for hungerbot**

Create `apps/hungerbot/src/__tests__/telemetry-service-name.test.ts` with the same file, expecting `'rainbot-hungerbot'`. Run it (`yarn workspace @rainbot/hungerbot-worker test src/__tests__/telemetry-service-name.test.ts`), confirm FAIL, then change `apps/hungerbot/src/telemetry.ts` to `startTelemetry('rainbot-hungerbot');` and confirm PASS.

- [ ] **Step 7: Write the failing source assertion for raincloud**

Raincloud's bootstrap is CommonJS `index.js` that does a great deal of work at require time, so this follows the existing source-reading pattern in the same file rather than importing it. Append to the `describe` block in `apps/raincloud/__tests__/telemetry-import-order.test.ts`:

```typescript
it('starts telemetry under the tenant-qualified service name', () => {
  const indexPath = path.join(__dirname, '..', 'index.js');
  const source = fs.readFileSync(indexPath, 'utf8');

  expect(source).toContain("observability.startTelemetry('rainbot-raincloud')");
});
```

If `fs` and `path` are not already imported in that file, add `import fs from 'fs';` and `import path from 'path';` at the top.

- [ ] **Step 8: Run it and confirm it fails**

```bash
yarn workspace @rainbot/raincloud test __tests__/telemetry-import-order.test.ts
```

Expected: FAIL on the new case; the pre-existing import-ordering case still passes.

- [ ] **Step 9: Rename raincloud**

`apps/raincloud/index.js:19` becomes:

```javascript
observability.startTelemetry('rainbot-raincloud');
```

- [ ] **Step 10: Run it and confirm it passes**

```bash
yarn workspace @rainbot/raincloud test __tests__/telemetry-import-order.test.ts
```

Expected: PASS, both cases.

- [ ] **Step 11: Update `.env.example`**

In the OpenTelemetry block, the `OTEL_SERVICE_NAME` note currently reads `(raincloud/rainbot/pranjeet/hungerbot in packages/observability/src/node/sdk.ts)`. Replace the service list and fix the stale file reference — the names live at the four call sites, not in `sdk.ts`:

```
# NOTE: OTEL_SERVICE_NAME is NOT read by this codebase. Each service passes
# its own fixed name to startTelemetry() (rainbot-raincloud in
# apps/raincloud/index.js, rainbot-rainbot / rainbot-pranjeet /
# rainbot-hungerbot in apps/<worker>/src/telemetry.ts) so it always matches
# the identity used elsewhere (dashboards, worker registration). The
# rainbot- prefix is required: the telemetry stack's Prometheus scrape uses
# honor_labels, so this string lands directly as the `job` label on a stack
# shared with other projects. Setting this variable has no effect - it exists
# here only so its absence isn't mistaken for a missing config value.
# OTEL_SERVICE_NAME=rainbot-raincloud
```

- [ ] **Step 12: Leave the unrelated `'raincloud'` literals alone**

Do not touch `apps/raincloud/server/index.ts:280` (`service: 'raincloud'` in a health payload) or the `'rainbot' | 'pranjeet' | 'hungerbot'` worker-type unions in `apps/raincloud/server/routes/`. Those are the worker-registration and API vocabulary, not OTel resource identity, and renaming them would break worker registration. Confirm with:

```bash
grep -rn "startTelemetry(" apps packages --include='*.ts' --include='*.js' | grep -v '/dist/' | grep -v __tests__
```

Expected: exactly four call sites, all `rainbot-*`.

- [ ] **Step 13: Full gate**

```bash
yarn validate
```

Expected: type-check, format:check and all test suites pass. If format:check fails, run `yarn format` and re-run.

- [ ] **Step 14: Commit**

```bash
git add apps .env.example
git commit -m "feat(observability): qualify OTel service names with the rainbot- prefix

The telemetry stack's Prometheus scrape runs honor_labels: true, so
service.name lands directly as the job label. Bare names left the four
services unqualified on a stack shared with cashflow and homelab, and made
job=\"rainbot\" mean the music worker rather than the project."
```

---

### Task 2: Span metrics from a filtered collector pipeline

Repository: `Connor-Adams/telemetry`. Branch from `main`: `feat/rainbot-span-metrics`.

**Files:**

- Modify: `services/otel-collector/config.yaml`
- Modify: `scripts/validate-stack.sh`

**Interfaces:**

- Consumes: the `rainbot-*` resource names from Task 1; the existing `otlp` receiver, `memory_limiter`/`batch` processors, and `prometheus` exporter on `:9464`.
- Produces: Prometheus series `rainbot_span_calls_total` and `rainbot_span_duration_milliseconds_{bucket,sum,count}`, carrying the connector's default dimensions (`service_name`, `span_name`, `span_kind`, `status_code`) plus `rainbot_command_name`, `rainbot_outcome`, `rainbot_worker`, `rainbot_rpc_procedure`, `rainbot_stream_type`, `rainbot_resolution_path`. Tasks 5 and 6 query these.

- [ ] **Step 1: Add the CI guard first**

In `scripts/validate-stack.sh`, immediately after the `==> otel-collector prod config (base + postgres overlay merge) parses` block, insert:

```bash
echo "==> spanmetrics connector is fed only by the filtered rainbot pipeline"
# The collector is shared with cashflow, whose spans are per-route and
# per-pg.query. Feeding the main traces pipeline into the connector would hand
# another tenant a cardinality problem, so the connector has its own pipeline
# behind filter/rainbot-spans. A parse check cannot catch that wiring being
# undone, hence this structural assertion.
python3 -c '
import sys, yaml
cfg = yaml.safe_load(open("services/otel-collector/config.yaml"))
pipes = cfg["service"]["pipelines"]
assert "spanmetrics" not in pipes["traces"]["exporters"], \
    "spanmetrics must not be an exporter of the unfiltered traces pipeline"
sm = pipes["traces/spanmetrics"]
assert sm["exporters"] == ["spanmetrics"], f"traces/spanmetrics exporters wrong: {sm[\"exporters\"]}"
assert "filter/rainbot-spans" in sm["processors"], "traces/spanmetrics is missing filter/rainbot-spans"
assert "spanmetrics" in pipes["metrics"]["receivers"], "metrics pipeline does not receive from spanmetrics"
dims = {d["name"] for d in cfg["connectors"]["spanmetrics"]["dimensions"]}
banned = {"rainbot.guild_id", "rainbot.user_id", "rainbot.track_url"}
assert not (dims & banned), f"unbounded dimensions present: {dims & banned}"
print("  spanmetrics wiring OK:", sorted(dims))
' || fail "spanmetrics connector wiring wrong"
```

- [ ] **Step 2: Push and watch it fail in CI**

```bash
git checkout -b feat/rainbot-span-metrics
git add scripts/validate-stack.sh
git commit -m "test(collector): assert the spanmetrics connector stays behind the rainbot filter"
git push -u origin feat/rainbot-span-metrics
gh pr create --fill --title "feat(collector): rainbot span metrics" --body "Implements Task 2 of docs/superpowers/plans/2026-09-24-rainbot-dashboards.md (rainbot repo)."
gh pr checks --watch
```

Expected: the `validate` job fails at `spanmetrics connector wiring` with a `KeyError: 'connectors'`.

- [ ] **Step 3: Add the connector, filter and pipeline**

In `services/otel-collector/config.yaml`, add a top-level `connectors:` block:

```yaml
connectors:
  # Command-level usage exists only as spans (Tempo has no metrics_generator
  # for span metrics, and Grafana has no Postgres datasource), so the counts
  # behind the rainbot usage dashboard are derived here.
  spanmetrics:
    namespace: rainbot.span
    metrics_flush_interval: 30s
    histogram:
      explicit:
        buckets: [10ms, 50ms, 100ms, 500ms, 1s, 2s, 5s, 10s, 30s]
    # Allowlist, not exclusions. rainbot.guild_id / user_id / track_url are
    # deliberately absent: unbounded label values in Prometheus cannot be
    # undone without dropping series.
    dimensions:
      - name: rainbot.command_name
      - name: rainbot.outcome
      - name: rainbot.worker
      - name: rainbot.rpc_procedure
      - name: rainbot.stream_type
      - name: rainbot.resolution_path
```

Add to the existing `processors:` block:

```yaml
# Drops every span that is NOT rainbot's, so the connector above never sees
# cashflow's per-route and per-pg.query span names. The OTTL condition
# describes what to DROP, hence the negation.
filter/rainbot-spans:
  error_mode: ignore
  traces:
    span:
      - 'not IsMatch(resource.attributes["service.name"], "^rainbot-")'
```

Rewrite the `service.pipelines` block so it reads exactly:

```yaml
service:
  pipelines:
    logs:
      receivers: [otlp]
      processors: [memory_limiter, attributes/redact, batch]
      exporters: [loki]
    metrics:
      receivers: [otlp, spanmetrics]
      processors: [memory_limiter, batch]
      exporters: [prometheus]
    traces:
      receivers: [otlp]
      processors: [memory_limiter, batch]
      exporters: [otlphttp/tempo]
    traces/spanmetrics:
      receivers: [otlp]
      processors: [memory_limiter, filter/rainbot-spans, batch]
      exporters: [spanmetrics]
```

- [ ] **Step 4: Push and confirm CI passes**

```bash
git add services/otel-collector/config.yaml
git commit -m "feat(collector): derive rainbot span metrics behind a tenant filter"
git push
gh pr checks --watch
```

Expected: `validate` passes — the base config and the postgres overlay merge both parse, and the wiring assertion prints `spanmetrics wiring OK` with the six dimensions.

---

### Task 3: Tempo service graphs, and the Prometheus receiver they need

Repository: `Connor-Adams/telemetry`, same branch.

**Files:**

- Modify: `services/tempo/config.yaml`
- Modify: `services/tempo/Dockerfile`
- Modify: `services/prometheus/entrypoint.sh`
- Modify: `scripts/validate-stack.sh`
- Modify: `README.md` (env var table)

**Interfaces:**

- Consumes: Tempo's existing OTLP distributor; Prometheus's remote-write endpoint at `:9090/api/v1/write`.
- Produces: `traces_service_graph_request_total` and its companions, labelled `client`/`server` by service name, with `source="tempo"`. Task 6's node-graph panel queries these.

- [ ] **Step 1: Add the CI guards first**

Two things need asserting. In `scripts/validate-stack.sh`, replace the `prometheus renders its template` block's inner shell command so it also checks the flag, by adding a line to the existing `-c '...'` script after the `promtool check config /tmp/p.yml` line:

```bash
     && grep -q -- "--web.enable-remote-write-receiver" /entrypoint.sh' \
```

And after the `==> tempo config verifies` block, add:

```bash
echo "==> tempo config enables the service-graphs generator only"
python3 -c '
import yaml
cfg = yaml.safe_load(open("services/tempo/config.yaml"))
procs = cfg["overrides"]["defaults"]["metrics_generator"]["processors"]
assert procs == ["service-graphs"], f"generator processors wrong: {procs}"
rw = cfg["metrics_generator"]["storage"]["remote_write"]
assert len(rw) == 1 and rw[0]["url"].endswith("/api/v1/write"), f"remote_write wrong: {rw}"
print("  tempo generator OK:", procs)
' || fail "tempo metrics_generator config wrong"
```

Note on why `span-metrics` is excluded: the collector connector from Task 2 owns span metrics. Running both producers would emit two overlapping families of call counts, and a panel author would have no way to know which one they were looking at.

- [ ] **Step 2: Push and watch both guards fail in CI**

```bash
git add scripts/validate-stack.sh
git commit -m "test(tempo,prometheus): assert the service-graph generator and its remote-write receiver"
git push
gh pr checks --watch
```

Expected: `validate` fails — first on the missing `--web.enable-remote-write-receiver`, or on `KeyError: 'overrides'` for Tempo.

- [ ] **Step 3: Enable the generator in Tempo**

Append to `services/tempo/config.yaml`:

```yaml
# Service graphs only. Span metrics come from the collector's spanmetrics
# connector instead (see services/otel-collector/config.yaml) — enabling
# span-metrics here too would produce a second, overlapping family of call
# counters with no way for a dashboard author to tell them apart.
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

- [ ] **Step 4: Let Tempo expand that env var**

This is the step most likely to be skipped and it fails silently in production. Tempo does **not** expand `${env:...}` unless told to, and its config has had no env vars until now. In `services/tempo/Dockerfile`, change the CMD:

```dockerfile
# -config.expand-env is required for ${env:PROMETHEUS_HOST} in the
# metrics_generator remote_write block. Without it Tempo treats the
# placeholder as a literal hostname and the generator's writes fail.
CMD ["-config.file=/etc/tempo.yaml", "-config.expand-env=true"]
```

The `==> tempo config verifies` step in `validate-stack.sh` must then pass both the flag and a probe value, or verification fails on the unexpanded placeholder. Update that docker invocation to:

```bash
docker run --rm -v "$PWD/services/tempo:/cfg" \
  -e PROMETHEUS_HOST=probe-prom \
  grafana/tempo:2.6.0 -config.file=/cfg/config.yaml -config.verify=true -config.expand-env=true \
  || fail "tempo config did not verify"
```

- [ ] **Step 5: Turn on Prometheus's remote-write receiver**

In `services/prometheus/entrypoint.sh`, the final `exec` becomes:

```sh
exec /bin/prometheus \
  --config.file="$OUTPUT" \
  --storage.tsdb.path=/prometheus \
  --web.enable-remote-write-receiver \
  --web.console.libraries=/usr/share/prometheus/console_libraries \
  --web.console.templates=/usr/share/prometheus/consoles \
  "$@"
```

Without this flag Tempo's remote-write returns 404 and the generator produces nothing — with no error anywhere in Grafana.

- [ ] **Step 6: Document the new variable**

In `README.md`'s env var table, the `tempo` row currently reads `| tempo | — | — | none |`. Replace it with:

```
| tempo | `PROMETHEUS_HOST` | yes | Prometheus's Dokploy appName; the `metrics_generator` remote-writes service-graph metrics to `:9090/api/v1/write`. Requires `-config.expand-env=true` (set in the Dockerfile CMD) and `--web.enable-remote-write-receiver` on Prometheus. Unset renders a literal `${env:PROMETHEUS_HOST}` host and the generator's writes fail with no Grafana-visible error. |
```

- [ ] **Step 7: Push and confirm CI passes**

```bash
git add services/tempo README.md services/prometheus/entrypoint.sh scripts/validate-stack.sh
git commit -m "feat(tempo): generate service-graph metrics into Prometheus"
git push
gh pr checks --watch
```

Expected: `validate` passes, printing `tempo generator OK: ['service-graphs']`.

---

### Task 4: `overview.json` — is rainbot healthy

Repository: `Connor-Adams/telemetry`, same branch.

Every metric on this board is already live in Prometheus, so it is the one dashboard that can be fully verified the moment it deploys.

**Files:**

- Create: `services/grafana/provisioning/dashboards/rainbot/overview.json`
- Modify: `scripts/validate-stack.sh` (dashboard title→folder map, and the header comment)

**Interfaces:**

- Consumes: `rainbot_worker_registered`, `rainbot_worker_orchestrator_healthy`, `rainbot_worker_rpc_duration_milliseconds_*`, `rainbot_voice_connections`, `up{job="otel-collector"}`, and Loki streams labelled `service_name=~"rainbot-.*"`.
- Produces: dashboard `uid` `rainbot-overview`, title `Rainbot Overview`. Tasks 5 and 6 link to this uid via their dashboard-links dropdown.

- [ ] **Step 1: Add the failing provisioning assertion**

In `scripts/validate-stack.sh`, the dashboard check's `want` dict gains one entry:

```python
    "AdGuard Home DNS": "homelab",
    "Rainbot Overview": "rainbot",
```

Update the script's header comment: `9 dashboards (8 cashflow, 1 homelab)` becomes `10 dashboards (8 cashflow, 1 homelab, 1 rainbot)`. Tasks 5 and 6 bump it to 11 and then 12.

The same step adds the datasource assertion the spec asks for — provisioning succeeds even when a panel points at a datasource uid that does not exist, and the panel then fails silently at view time. After the dashboard foldering check, add:

```bash
echo "==> every provisioned dashboard panel targets a real datasource uid"
python3 -c '
import glob, json, sys
valid = {"prometheus", "loki", "tempo"}
bad = []
for path in sorted(glob.glob("services/grafana/provisioning/dashboards/*/*.json")):
    dash = json.load(open(path))
    for panel in dash.get("panels", []):
        refs = [panel.get("datasource")] + [t.get("datasource") for t in panel.get("targets", [])]
        for ref in refs:
            if isinstance(ref, dict) and ref.get("uid") not in valid:
                bad.append((path, panel.get("title"), ref.get("uid")))
assert not bad, f"unknown datasource uids: {bad}"
print("  datasource refs OK across", len(glob.glob("services/grafana/provisioning/dashboards/*/*.json")), "dashboards")
' || fail "a dashboard references an unknown datasource uid"
```

This also parses every dashboard JSON, so a malformed file fails CI rather than being skipped silently by Grafana at boot.

- [ ] **Step 2: Push and watch it fail**

```bash
git add scripts/validate-stack.sh
git commit -m "test(grafana): expect the Rainbot Overview dashboard in a rainbot folder"
git push
gh pr checks --watch
```

Expected: `validate` fails with `dashboards wrong: got [...], want [...]` — the rainbot entry is missing.

- [ ] **Step 3: Write the dashboard**

Create `services/grafana/provisioning/dashboards/rainbot/overview.json`. Dashboard-level keys:

```json
{
  "annotations": { "list": [] },
  "editable": false,
  "fiscalYearStartMonth": 0,
  "graphTooltip": 1,
  "id": null,
  "links": [
    {
      "asDropdown": true,
      "icon": "external link",
      "includeVars": true,
      "keepTime": true,
      "tags": ["rainbot"],
      "targetBlank": false,
      "title": "Rainbot",
      "type": "dashboards"
    }
  ],
  "panels": [],
  "refresh": "30s",
  "schemaVersion": 39,
  "tags": ["rainbot", "overview"],
  "time": { "from": "now-6h", "to": "now" },
  "timepicker": {},
  "timezone": "browser",
  "title": "Rainbot Overview",
  "uid": "rainbot-overview",
  "version": 1
}
```

This is the complete panel list. Every Prometheus panel follows the pattern object below it; `id` values are sequential from 1, `gridPos` is given per panel.

| id  | Title                             | Type       | Unit  | gridPos (h,w,x,y) | Query                                                                                                                                                                             |
| --- | --------------------------------- | ---------- | ----- | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Collector scrape up               | stat       | short | 4,6,0,0           | `up{job="otel-collector"}`                                                                                                                                                        |
| 2   | Voice connections                 | stat       | short | 4,6,6,0           | `sum(rainbot_voice_connections)`                                                                                                                                                  |
| 3   | Error log rate (per s)            | stat       | short | 4,12,12,0         | Loki: `sum(rate({service_name=~"rainbot-.*", level="ERROR"}[$__rate_interval]))`                                                                                                  |
| 4   | Worker self-report (registered)   | timeseries | short | 7,12,0,4          | `rainbot_worker_registered` · legend `{{rainbot_worker}}`                                                                                                                         |
| 5   | Orchestrator view (healthy)       | timeseries | short | 7,12,12,4         | `rainbot_worker_orchestrator_healthy{job="rainbot-raincloud"}` · legend `{{rainbot_worker}}`                                                                                      |
| 6   | RPC p95 by procedure              | timeseries | ms    | 8,12,0,11         | `histogram_quantile(0.95, sum by (le, rainbot_rpc_procedure) (rate(rainbot_worker_rpc_duration_milliseconds_bucket[$__rate_interval])))` · legend `p95 {{rainbot_rpc_procedure}}` |
| 7   | RPC outcome rate (by span status) | timeseries | short | 8,12,12,11        | `sum by (status_code) (rate(rainbot_span_calls_total{span_name="worker.rpc"}[$__rate_interval]))` · legend `{{status_code}}` — see the correction note below the table            |
| 8   | Voice connections by service      | timeseries | short | 8,12,0,19         | `sum by (job) (rainbot_voice_connections)` · legend `{{job}}`                                                                                                                     |
| 9   | Errors and warnings               | logs       | —     | 10,12,12,19       | Loki: `{service_name=~"rainbot-.*", level=~"ERROR\|WARN"}`                                                                                                                        |

Panels 4 and 5 are deliberately side by side at the same `y`. `rainbot_worker_registered` is each worker's own boot-time self-report with no heartbeat; `rainbot_worker_orchestrator_healthy` is raincloud's circuit-breaker belief. They diverge exactly when raincloud has restarted and lost its registry while a worker's stale `1` persists, and that divergence is only legible if both are on screen. Workers retry registration four times and then stop forever, so a flat `0` never recovers on its own.

**Correction (found in review of this task).** Panel 7 originally read
`sum by (rainbot_outcome) (rate(rainbot_worker_rpc_duration_milliseconds_count[...]))`, which is
wrong: `rainbot.worker.rpc.duration` is recorded at one call site (`packages/rpc/src/client.ts`)
with `rainbot.rpc_procedure` and `rainbot.worker` only, and `rainbot.outcome` is used solely on the
track-resolve paths. That query does not return No data — it collapses to one flat series with a
blank legend, which is worse. RPC success/failure lives in the span-metrics family instead: the
client span is named `worker.rpc` and the connector emits `status_code` by default. The panel now
queries that, and carries a description saying why the histogram cannot answer it.

Pattern object for a Prometheus timeseries panel (panel 6 shown complete):

```json
{
  "datasource": { "type": "prometheus", "uid": "prometheus" },
  "fieldConfig": {
    "defaults": {
      "color": { "mode": "palette-classic" },
      "custom": { "lineWidth": 1, "fillOpacity": 10 },
      "unit": "ms"
    },
    "overrides": []
  },
  "gridPos": { "h": 8, "w": 12, "x": 0, "y": 11 },
  "id": 6,
  "options": {
    "legend": { "calcs": ["mean", "max"], "displayMode": "table", "placement": "bottom" },
    "tooltip": { "mode": "multi" }
  },
  "targets": [
    {
      "datasource": { "type": "prometheus", "uid": "prometheus" },
      "expr": "histogram_quantile(0.95, sum by (le, rainbot_rpc_procedure) (rate(rainbot_worker_rpc_duration_milliseconds_bucket[$__rate_interval])))",
      "legendFormat": "p95 {{rainbot_rpc_procedure}}",
      "refId": "A"
    }
  ],
  "title": "RPC p95 by procedure",
  "type": "timeseries"
}
```

Pattern object for a `stat` panel (panel 1 shown complete):

```json
{
  "datasource": { "type": "prometheus", "uid": "prometheus" },
  "fieldConfig": {
    "defaults": {
      "color": { "mode": "thresholds" },
      "mappings": [],
      "thresholds": {
        "mode": "absolute",
        "steps": [
          { "color": "red", "value": null },
          { "color": "green", "value": 1 }
        ]
      },
      "unit": "short"
    },
    "overrides": []
  },
  "gridPos": { "h": 4, "w": 6, "x": 0, "y": 0 },
  "id": 1,
  "options": {
    "colorMode": "background",
    "graphMode": "none",
    "reduceOptions": { "calcs": ["lastNotNull"], "fields": "", "values": false }
  },
  "targets": [
    {
      "datasource": { "type": "prometheus", "uid": "prometheus" },
      "expr": "up{job=\"otel-collector\"}",
      "legendFormat": "collector",
      "refId": "A"
    }
  ],
  "title": "Collector scrape up",
  "type": "stat"
}
```

Pattern object for a Loki `logs` panel (panel 9 shown complete):

```json
{
  "datasource": { "type": "loki", "uid": "loki" },
  "gridPos": { "h": 10, "w": 12, "x": 12, "y": 19 },
  "id": 9,
  "options": {
    "dedupStrategy": "none",
    "enableLogDetails": true,
    "showTime": true,
    "sortOrder": "Descending",
    "wrapLogMessage": true
  },
  "targets": [
    {
      "datasource": { "type": "loki", "uid": "loki" },
      "expr": "{service_name=~\"rainbot-.*\", level=~\"ERROR|WARN\"}",
      "queryType": "range",
      "refId": "A"
    }
  ],
  "title": "Errors and warnings",
  "type": "logs"
}
```

Loki stat panels (panel 3) use the Loki datasource object with the timeseries `fieldConfig` shape and `"type": "stat"`.

- [ ] **Step 4: Push and confirm CI passes**

```bash
git add services/grafana/provisioning/dashboards/rainbot/overview.json
git commit -m "feat(grafana): provision the Rainbot Overview dashboard"
git push
gh pr checks --watch
```

Expected: `validate` passes, printing `dashboards OK: 10 across ['cashflow', 'homelab', 'rainbot']`.

---

### Task 5: `playback.json` — why playback broke

Repository: `Connor-Adams/telemetry`, same branch.

Unlike Task 4, most of these series do not exist yet: the instruments are lazy and nothing has played a track since the telemetry deploy. Panels are written from the declared instruments and confirmed in Task 7.

**Files:**

- Create: `services/grafana/provisioning/dashboards/rainbot/playback.json`
- Modify: `scripts/validate-stack.sh`

**Interfaces:**

- Consumes: `rainbot_track_resolve_duration_milliseconds_*`, `rainbot_track_resolve_failures_total`, `rainbot_sound_play_duration_milliseconds_count`, `rainbot_span_calls_total` (from Task 2), Loki `service_name="rainbot-rainbot"`, Tempo.
- Produces: dashboard `uid` `rainbot-playback`, title `Rainbot Playback`.

- [ ] **Step 1: Add the failing assertion**

In `scripts/validate-stack.sh`, add `"Rainbot Playback": "rainbot",` to the `want` dict and change the header comment's count from `10 dashboards (8 cashflow, 1 homelab, 1 rainbot)` to `11 dashboards (8 cashflow, 1 homelab, 2 rainbot)`. Then:

```bash
git add scripts/validate-stack.sh
git commit -m "test(grafana): expect the Rainbot Playback dashboard"
git push
gh pr checks --watch
```

Expected: `validate` fails with `dashboards wrong` — the playback entry is missing.

- [ ] **Step 2: Write the dashboard**

Create `services/grafana/provisioning/dashboards/rainbot/playback.json`. Dashboard-level keys:

```json
{
  "annotations": { "list": [] },
  "editable": false,
  "fiscalYearStartMonth": 0,
  "graphTooltip": 1,
  "id": null,
  "links": [
    {
      "asDropdown": true,
      "icon": "external link",
      "includeVars": true,
      "keepTime": true,
      "tags": ["rainbot"],
      "targetBlank": false,
      "title": "Rainbot",
      "type": "dashboards"
    }
  ],
  "panels": [],
  "refresh": "30s",
  "schemaVersion": 39,
  "tags": ["rainbot", "playback"],
  "time": { "from": "now-6h", "to": "now" },
  "timepicker": {},
  "timezone": "browser",
  "title": "Rainbot Playback",
  "uid": "rainbot-playback",
  "version": 1
}
```

Add to `links` a second entry so the board reaches Explore directly:

```json
{
  "icon": "external link",
  "targetBlank": false,
  "title": "Music worker traces",
  "type": "link",
  "url": "/explore?schemaVersion=1&panes=%7B%22traces%22:%7B%22datasource%22:%22tempo%22,%22queries%22:%5B%7B%22refId%22:%22A%22,%22queryType%22:%22traceql%22,%22query%22:%22%7Bresource.service.name%3D%5C%22rainbot-rainbot%5C%22%7D%22%7D%5D,%22range%22:%7B%22from%22:%22now-1h%22,%22to%22:%22now%22%7D%7D%7D&orgId=1"
}
```

Complete panel list, all following Task 4's pattern objects:

| id  | Title                              | Type       | Unit        | gridPos    | Query                                                                                                                                                                                                                                 |
| --- | ---------------------------------- | ---------- | ----------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Resolve latency by extraction path | timeseries | ms          | 8,12,0,0   | three targets, `histogram_quantile(Q, sum by (le, rainbot_extraction_path) (rate(rainbot_track_resolve_duration_milliseconds_bucket[$__rate_interval])))` for Q = 0.5, 0.95, 0.99 · legends `p50/p95/p99 {{rainbot_extraction_path}}` |
| 2   | Resolve latency by source          | timeseries | ms          | 8,12,12,0  | `histogram_quantile(0.95, sum by (le, rainbot_track_source) (rate(rainbot_track_resolve_duration_milliseconds_bucket[$__rate_interval])))` · legend `p95 {{rainbot_track_source}}`                                                    |
| 3   | Resolve failures by class          | timeseries | short       | 8,12,0,8   | `sum by (rainbot_outcome, rainbot_track_source) (rate(rainbot_track_resolve_failures_total[$__rate_interval]))` · legend `{{rainbot_track_source}} / {{rainbot_outcome}}`                                                             |
| 4   | Failure ratio (1h)                 | stat       | percentunit | 8,6,12,8   | `sum(rate(rainbot_track_resolve_failures_total[1h])) / (sum(rate(rainbot_track_resolve_failures_total[1h])) + sum(rate(rainbot_track_resolve_duration_milliseconds_count[1h])))`, thresholds green `null` / yellow `0.05` / red `0.2` |
| 5   | Resolutions per minute             | timeseries | short       | 8,6,18,8   | `sum by (rainbot_extraction_path) (rate(rainbot_track_resolve_duration_milliseconds_count[$__rate_interval])) * 60` · legend `{{rainbot_extraction_path}}`                                                                            |
| 6   | Stream shape                       | timeseries | short       | 8,12,0,16  | `sum by (rainbot_stream_type, rainbot_resolution_path) (rate(rainbot_span_calls_total{span_name="audio.resource.create"}[$__rate_interval]))` · legend `{{rainbot_stream_type}} / {{rainbot_resolution_path}}`                        |
| 7   | Soundboard phases                  | timeseries | short       | 8,12,12,16 | `sum by (rainbot_phase) (rate(rainbot_sound_play_duration_milliseconds_count[$__rate_interval]))` · legend `{{rainbot_phase}}`                                                                                                        |
| 8   | Music worker errors                | logs       | —           | 10,24,0,24 | Loki: `{service_name="rainbot-rainbot", level=~"ERROR\|WARN"}`                                                                                                                                                                        |

Panel 3 is the yt-dlp rot signal: `rainbot.track.resolve.failures` is documented in `packages/observability/src/node/metrics.ts` as trending up before playback fails outright, which makes panel 4 the one to watch between weekly image rebuilds.

Panel 6's `span_name` is a guess — the span name in `apps/rainbot/src/voice/audioResource.ts` must be read and the value corrected in Task 7 if it differs.

- [ ] **Step 3: Push and confirm CI passes**

```bash
git add services/grafana/provisioning/dashboards/rainbot/playback.json scripts/validate-stack.sh
git commit -m "feat(grafana): provision the Rainbot Playback dashboard"
git push
gh pr checks --watch
```

Expected: `validate` passes with the playback board in the `rainbot` folder.

---

### Task 6: `usage.json` — what is being used

Repository: `Connor-Adams/telemetry`, same branch.

**Files:**

- Create: `services/grafana/provisioning/dashboards/rainbot/usage.json`
- Modify: `scripts/validate-stack.sh`

**Interfaces:**

- Consumes: `rainbot_span_calls_total` (Task 2), `traces_service_graph_request_total` (Task 3), `rainbot_sound_play_duration_milliseconds_count`, `rainbot_track_resolve_duration_milliseconds_count`.
- Produces: dashboard `uid` `rainbot-usage`, title `Rainbot Usage`.

- [ ] **Step 1: Add the failing assertion**

In `scripts/validate-stack.sh`, add `"Rainbot Usage": "rainbot",` to the `want` dict and change the header comment's count to `12 dashboards (8 cashflow, 1 homelab, 3 rainbot)`. Then:

```bash
git add scripts/validate-stack.sh
git commit -m "test(grafana): expect the Rainbot Usage dashboard"
git push
gh pr checks --watch
```

Expected: `validate` fails with `dashboards wrong` — the usage entry is missing.

- [ ] **Step 2: Write the dashboard**

Create `services/grafana/provisioning/dashboards/rainbot/usage.json`. Dashboard-level keys — note the wider default time range, since usage is read over days:

```json
{
  "annotations": { "list": [] },
  "editable": false,
  "fiscalYearStartMonth": 0,
  "graphTooltip": 1,
  "id": null,
  "links": [
    {
      "asDropdown": true,
      "icon": "external link",
      "includeVars": true,
      "keepTime": true,
      "tags": ["rainbot"],
      "targetBlank": false,
      "title": "Rainbot",
      "type": "dashboards"
    }
  ],
  "panels": [],
  "refresh": "30s",
  "schemaVersion": 39,
  "tags": ["rainbot", "usage"],
  "time": { "from": "now-7d", "to": "now" },
  "timepicker": {},
  "timezone": "browser",
  "title": "Rainbot Usage",
  "uid": "rainbot-usage",
  "version": 1
}
```

| id  | Title                     | Type       | Unit  | gridPos   | Query                                                                                                                                                                                         |
| --- | ------------------------- | ---------- | ----- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Commands per hour         | timeseries | short | 8,12,0,0  | `sum by (rainbot_command_name) (rate(rainbot_span_calls_total{span_name="command.execute"}[$__rate_interval])) * 3600` · legend `{{rainbot_command_name}}`                                    |
| 2   | Top commands (range)      | barchart   | short | 8,12,12,0 | `topk(15, sum by (rainbot_command_name) (increase(rainbot_span_calls_total{span_name="command.execute"}[$__range])))` · legend `{{rainbot_command_name}}`, `"instant": true`                  |
| 3   | Command failures          | timeseries | short | 8,12,0,8  | `sum by (rainbot_command_name) (rate(rainbot_span_calls_total{span_name="command.execute", status_code="STATUS_CODE_ERROR"}[$__rate_interval]))` · legend `{{rainbot_command_name}}`          |
| 4   | Soundboard plays per hour | timeseries | short | 8,12,12,8 | `sum(rate(rainbot_sound_play_duration_milliseconds_count{rainbot_phase="dispatch"}[$__rate_interval])) * 3600` · legend `plays/hour` — per-sound ranking is a Tempo query, see the note below |
| 5   | Tracks by source (range)  | piechart   | short | 8,8,0,16  | `sum by (rainbot_track_source) (increase(rainbot_track_resolve_duration_milliseconds_count[$__range]))` · legend `{{rainbot_track_source}}`, `"instant": true`                                |
| 6   | Service topology          | nodeGraph  | —     | 8,16,8,16 | `sum by (client, server) (rate(traces_service_graph_request_total[$__rate_interval]))`                                                                                                        |

**Per-sound counts are deliberately not metrics.** `rainbot.sound` is a user-uploaded R2 object key,
and both `recordSoundPlay` call sites (`apps/hungerbot/src/handlers/rpc.ts`,
`packages/worker-shared/src/voiceRpcHandlers.ts`) carry a comment explaining why it is kept off the
histogram: each distinct value costs ~14 bucket series that are never reclaimed as sounds
accumulate. It stays a span attribute on the `sound.play` span, where cardinality is free. So the
usage board shows soundboard volume only, and links to Explore for the ranking: TraceQL
`{name="sound.play"}`, inspected by `rainbot.sound` in Tempo. Connor chose this over adding the
dimension (2026-09-24).

Panel 3 carries a caveat that belongs in its description field, not only in this plan — set `"description"` on the panel to:

```
Undercounts. command.execute spans are only marked ERROR when the handler throws; several commands catch internally and reply with an error embed, which resolves normally. See the comment above the withSpan call in apps/raincloud/src/events/interactionCreate.js.
```

Grok token spend is deliberately absent: the counts are span attributes (`rainbot.grok_*_tokens`) and putting them in the connector's dimension allowlist buys a cardinality risk nobody has asked for.

- [ ] **Step 3: Push and confirm CI passes**

```bash
git add services/grafana/provisioning/dashboards/rainbot/usage.json scripts/validate-stack.sh
git commit -m "feat(grafana): provision the Rainbot Usage dashboard"
git push
gh pr checks --watch
```

Expected: `validate` passes, printing `dashboards OK: 12 across ['cashflow', 'homelab', 'rainbot']`.

---

### Task 7: Deploy, then verify every unverified query

This task is where the spec's "Unverified queries" list gets closed. It needs Connor for the Dokploy steps and for exercising the bots — neither is automatable from here.

**Files:**

- Modify (as findings require): the three dashboard JSON files
- Modify: `docs/superpowers/specs/2026-09-24-rainbot-dashboards-design.md` in the rainbot repo (strike resolved items from the Unverified list)

**Interfaces:**

- Consumes: everything from Tasks 1–6, deployed.
- Produces: dashboards whose every panel either returns series or is documented as intentionally empty.

- [ ] **Step 1: Merge and deploy, in order**

Merge both PRs. Then, in Dokploy: set `PROMETHEUS_HOST` on the tempo application to the Prometheus appName, redeploy `prometheus` (new flag), `tempo` (generator + expand-env), `otel-collector` (connector), then `grafana` (dashboards). Redeploy rainbot: raincloud first, wait for `/health/ready`, then the three workers — workers burn four registration retries and then give up permanently, so starting them against a cold orchestrator leaves them stuck at `registered=0`.

Health-check the boxes over `https://192.168.2.88` with `-k`; the domains are `https=true` now and plain `http` 301-redirects.

After a worker redeploy, confirm only one container per bot is running. A rolling update has been seen briefly leaving two, and two live containers on one Discord token double-respond to every command.

- [ ] **Step 2: Confirm the rename landed in all three signals**

```bash
zsh -c 'source ~/.config/secrets/cashflow-grafana.env; source ~/.config/secrets/gv.env; \
  H="Authorization: Bearer $GRAFANA_SA_TOKEN"; \
  curl -s -H "$H" "$GRAFANA_BASE_URL/api/datasources/proxy/uid/prometheus/api/v1/label/job/values"; echo; \
  curl -s -H "$H" "$GRAFANA_BASE_URL/api/datasources/proxy/uid/loki/loki/api/v1/label/service_name/values"'
```

Expected: `rainbot-raincloud`, `rainbot-rainbot`, `rainbot-pranjeet`, `rainbot-hungerbot` in both. The bare names remain in Prometheus as historical series and can be ignored.

Note: `gv.env` holds only `GRAFANA_BASE_URL`; the SA token lives in `cashflow-grafana.env` alongside the _old_ base URL, hence the sourcing order above. Moving the token into `gv.env` with `setkey GRAFANA_SA_TOKEN` would make this a single source.

- [ ] **Step 3: Exercise every idle code path**

Ask Connor to run, in Discord: join a voice channel, `/play` a YouTube track, `/skip` it, `/play` a SoundCloud or Spotify link, one soundboard sound, one `/chat` message to Pranjeet, and one command that fails (a malformed URL). This is the only way the lazy instruments get created.

- [ ] **Step 4: Resolve the unverified list**

For each item, query the proxy and correct the dashboards. Series names first:

```bash
zsh -c 'source ~/.config/secrets/cashflow-grafana.env; source ~/.config/secrets/gv.env; \
  curl -s -H "Authorization: Bearer $GRAFANA_SA_TOKEN" --get \
  --data-urlencode "match[]={__name__=~\"rainbot_.*\"}" \
  "$GRAFANA_BASE_URL/api/datasources/proxy/uid/prometheus/api/v1/series" \
  | python3 -c "
import sys, json
d = json.load(sys.stdin)[\"data\"]
names = sorted({s[\"__name__\"] for s in d})
print(len(d), \"series\", len(names), \"names\")
for n in names: print(\" \", n)
labels = sorted({k for s in d for k in s})
print(\"labels:\", labels)
"'
```

Then check, and fix each panel that is wrong:

1. `_total` on `rainbot_track_resolve_failures` — correct panels 3 and 4 of playback if the real name differs.
2. Label values for `rainbot_track_source`, `rainbot_extraction_path`, `rainbot_outcome`, `rainbot_phase` — confirm legends read sensibly.
3. RESOLVED before implementation: the span is `audio.resource.create`, not the invented `track.stream` — three call sites in `apps/rainbot/src/voice/audioResource.ts` set `rainbot.stream_type` / `rainbot.resolution_path` on it.
4. Dimension sanitisation — confirm `rainbot_command_name` is the label the connector emits.
5. `status_code` values — usage panel 3 assumes `STATUS_CODE_ERROR`.
6. Node runtime metric names — query `{__name__=~"nodejs_.*|v8js_.*", job=~"rainbot-.*"}` and, if present, add the deferred runtime row to overview.
7. Whether spanmetrics output carries a `job` label as well as `service_name`.

Also confirm containment: every `rainbot_span_calls_total` series must have `service_name` matching `^rainbot-`. Any cashflow value means the filter is not working and the connector is feeding on unfiltered traces.

- [ ] **Step 5: Confirm cashflow is unharmed**

Open each of cashflow's eight dashboards and confirm they still render. The collector's traces pipeline changed shape and Tempo gained a generator; both are shared.

- [ ] **Step 6: Commit the corrections and close out the spec**

Commit dashboard fixes to the telemetry repo with a message naming what the live data disagreed with. In the rainbot repo, update the spec's "Unverified queries" section to record what was confirmed and what was corrected, so the next reader knows the list is closed rather than abandoned.
