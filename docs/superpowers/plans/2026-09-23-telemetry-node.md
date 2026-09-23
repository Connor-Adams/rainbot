# Node Telemetry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Emit traces, metrics and correlated logs from all four rainbot bots to the existing self-hosted OpenTelemetry collector.

**Architecture:** A new `@rainbot/observability` workspace exposes a node subpath (SDK bootstrap, span helpers, metric instruments) and a semconv subpath (attribute name constants). Each bot requires the bootstrap as its very first statement so auto-instrumentation can patch modules before they load. Both existing Winston logger modules gain an OTLP transport that stamps the active trace context onto every log line.

**Tech Stack:** TypeScript 5.9, Yarn 4 workspaces, Turbo, ts-jest, Winston 3, OpenTelemetry Node SDK 0.218 / API 1.9.

This plan covers the node side only. Browser telemetry — the authenticated OTLP proxy route on raincloud, the web SDK, and the three UI seams — is a separate plan that depends on this one landing first.

Spec: [docs/superpowers/specs/2026-09-23-telemetry-design.md](../specs/2026-09-23-telemetry-design.md)

## Global Constraints

- Pin OpenTelemetry versions to match cashflow exactly, so one stack serves both: `@opentelemetry/api ^1.9.1`, `auto-instrumentations-node ^0.76.0`, `exporter-trace-otlp-http ^0.218.0`, `exporter-metrics-otlp-http ^0.218.0`, `instrumentation-runtime-node ^0.31.0`, `resources ^2.7.1`, `sdk-metrics ^2.7.1`, `sdk-node ^0.218.0`, `sdk-trace-base ^2.7.1`, `semantic-conventions ^1.41.1`.
- Telemetry must never take a bot down. Every exporter and transport failure is caught, logged once at `warn`, and dropped.
- `OTEL_SDK_DISABLED=true` must skip bootstrap entirely — a broken collector is always one env var away from being out of the path.
- Attribute names come from `@rainbot/observability/semconv`. Never inline an attribute string literal; the names are the contract with Grafana.
- Collector endpoint is `http://telemetry-otel-collector-wyuddq-c1orqh:4318`. It is internal-only and must never be given a public domain.
- `yarn validate` (type-check, format:check, test) must pass before every commit.
- Tests live in `__tests__/` beside the code, per repo convention.

## File Structure

| file                                                                            | responsibility                                                |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `packages/observability/package.json`                                           | Workspace manifest, three subpath exports, dual CJS+ESM build |
| `packages/observability/src/semconv.ts`                                         | Attribute name constants                                      |
| `packages/observability/src/node/sdk.ts`                                        | SDK lifecycle: `startTelemetry()`, `shutdownTelemetry()`      |
| `packages/observability/src/node/spans.ts`                                      | `withSpan()` helper wrapping tracer + error recording         |
| `packages/observability/src/node/metrics.ts`                                    | The six instruments and their record functions                |
| `packages/observability/src/node/winstonTransport.ts`                           | Winston transport emitting OTLP logs with trace context       |
| `packages/observability/src/node/index.ts`                                      | Node subpath barrel                                           |
| `packages/shared/src/logger.ts`                                                 | Gains the OTLP transport                                      |
| `packages/utils/src/logger.ts`                                                  | Gains the OTLP transport                                      |
| `apps/raincloud/index.js`                                                       | Bootstrap as first statement                                  |
| `apps/{rainbot,pranjeet,hungerbot}/src/index.ts`                                | Bootstrap as first import                                     |
| `packages/utils/src/voice/*`, `packages/worker-shared/src/*`, app voice modules | Domain spans                                                  |

Tasks 1–5 build and prove the package in isolation. Tasks 6–8 wire it into the running services. Tasks 9–11 add domain instrumentation. Task 12 deploys and verifies against the live collector.

---

### Task 1: Scaffold the package with semconv

**Files:**

- Create: `packages/observability/package.json`
- Create: `packages/observability/tsconfig.json`
- Create: `packages/observability/tsconfig.esm.json`
- Create: `packages/observability/jest.config.js`
- Create: `packages/observability/src/semconv.ts`
- Test: `packages/observability/src/__tests__/semconv.test.ts`

**Interfaces:**

- Consumes: nothing.
- Produces: `RainbotAttr`, a frozen record of attribute-name constants, importable as `@rainbot/observability/semconv`.

- [ ] **Step 1: Write the failing test**

```typescript
// packages/observability/src/__tests__/semconv.test.ts
import { RainbotAttr } from '../semconv';

describe('RainbotAttr', () => {
  it('namespaces every attribute under rainbot.', () => {
    for (const value of Object.values(RainbotAttr)) {
      expect(value).toMatch(/^rainbot\./);
    }
  });

  it('has no duplicate attribute names', () => {
    const values = Object.values(RainbotAttr);
    expect(new Set(values).size).toBe(values.length);
  });

  it('exposes the attributes the spec names', () => {
    expect(RainbotAttr.guildId).toBe('rainbot.guild_id');
    expect(RainbotAttr.worker).toBe('rainbot.worker');
    expect(RainbotAttr.extractionPath).toBe('rainbot.extraction_path');
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `yarn workspace @rainbot/observability test`
Expected: FAIL — `Cannot find module '../semconv'`.

- [ ] **Step 3: Create the package manifest**

```json
{
  "name": "@rainbot/observability",
  "version": "1.0.0",
  "private": true,
  "main": "./dist/node/index.js",
  "types": "./dist/node/index.d.ts",
  "exports": {
    "./node": {
      "types": "./dist/node/index.d.ts",
      "default": "./dist/node/index.js"
    },
    "./semconv": {
      "import": "./dist/esm/semconv.js",
      "require": "./dist/semconv.js",
      "types": "./dist/semconv.d.ts"
    }
  },
  "scripts": {
    "build": "tsc && tsc -p tsconfig.esm.json",
    "build:ts": "tsc && tsc -p tsconfig.esm.json",
    "prettier": "prettier --write .",
    "prettier:check": "prettier --check .",
    "type-check": "tsc --noEmit",
    "test": "jest --passWithNoTests"
  },
  "dependencies": {
    "@opentelemetry/api": "^1.9.1",
    "@opentelemetry/auto-instrumentations-node": "^0.76.0",
    "@opentelemetry/exporter-metrics-otlp-http": "^0.218.0",
    "@opentelemetry/exporter-trace-otlp-http": "^0.218.0",
    "@opentelemetry/instrumentation-runtime-node": "^0.31.0",
    "@opentelemetry/resources": "^2.7.1",
    "@opentelemetry/sdk-metrics": "^2.7.1",
    "@opentelemetry/sdk-node": "^0.218.0",
    "@opentelemetry/sdk-trace-base": "^2.7.1",
    "@opentelemetry/semantic-conventions": "^1.41.1",
    "winston-transport": "^4.9.0"
  },
  "devDependencies": {
    "@types/node": "^25.0.3",
    "typescript": "^5.9.3",
    "winston": "^3.19.0"
  }
}
```

The `semconv` subpath is dual-built because the browser plan imports it; `node` is CJS only.

- [ ] **Step 4: Create the tsconfigs and jest config**

`packages/observability/tsconfig.json` — copy `packages/shared/tsconfig.json` verbatim.

`packages/observability/tsconfig.esm.json`:

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "module": "ESNext",
    "moduleResolution": "bundler",
    "outDir": "./dist/esm"
  }
}
```

`packages/observability/jest.config.js` — copy `packages/shared/jest.config.js` verbatim.

- [ ] **Step 5: Write semconv.ts**

```typescript
// packages/observability/src/semconv.ts

/**
 * Attribute names are the contract with Grafana dashboards and alert rules: a
 * rename here silently breaks every query that used the old name. They live in
 * one frozen object so both the bots and the browser bundle describe the same
 * thing with the same key.
 */
export const RainbotAttr = Object.freeze({
  guildId: 'rainbot.guild_id',
  userId: 'rainbot.user_id',
  worker: 'rainbot.worker',
  sound: 'rainbot.sound',
  trackUrl: 'rainbot.track_url',
  trackSource: 'rainbot.track_source',
  voiceChannel: 'rainbot.voice_channel',
  queueLength: 'rainbot.queue_length',
  extractionPath: 'rainbot.extraction_path',
  proxyUsed: 'rainbot.proxy_used',
  rpcProcedure: 'rainbot.rpc_procedure',
  outcome: 'rainbot.outcome',
} as const);

export type RainbotAttrName = (typeof RainbotAttr)[keyof typeof RainbotAttr];
```

- [ ] **Step 6: Run the test and watch it pass**

Run: `yarn workspace @rainbot/observability test`
Expected: PASS, 3 tests.

- [ ] **Step 7: Install and verify the workspace resolves**

Run: `yarn install && yarn build:ts`
Expected: exit 0, `packages/observability/dist/semconv.js` and `dist/esm/semconv.js` both exist.

- [ ] **Step 8: Commit**

```bash
git add packages/observability yarn.lock
git commit -m "feat(observability): scaffold package with shared attribute names"
```

---

### Task 2: SDK bootstrap

**Files:**

- Create: `packages/observability/src/node/sdk.ts`
- Create: `packages/observability/src/node/index.ts`
- Test: `packages/observability/src/node/__tests__/sdk.test.ts`

**Interfaces:**

- Consumes: `RainbotAttr` from Task 1.
- Produces: `startTelemetry(serviceName: string): void` and `shutdownTelemetry(): Promise<void>`. `startTelemetry` is idempotent and returns without doing anything when `OTEL_SDK_DISABLED === 'true'`.

- [ ] **Step 1: Write the failing test**

```typescript
// packages/observability/src/node/__tests__/sdk.test.ts
import { startTelemetry, shutdownTelemetry, isTelemetryStarted } from '../sdk';

describe('startTelemetry', () => {
  afterEach(async () => {
    await shutdownTelemetry();
    delete process.env['OTEL_SDK_DISABLED'];
  });

  it('does nothing when OTEL_SDK_DISABLED is true', () => {
    process.env['OTEL_SDK_DISABLED'] = 'true';
    startTelemetry('test-service');
    expect(isTelemetryStarted()).toBe(false);
  });

  it('starts once and is idempotent', () => {
    startTelemetry('test-service');
    startTelemetry('test-service');
    expect(isTelemetryStarted()).toBe(true);
  });

  it('never throws when the collector endpoint is unreachable', () => {
    process.env['OTEL_EXPORTER_OTLP_ENDPOINT'] = 'http://127.0.0.1:1';
    expect(() => startTelemetry('test-service')).not.toThrow();
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `yarn workspace @rainbot/observability test src/node/__tests__/sdk.test.ts`
Expected: FAIL — `Cannot find module '../sdk'`.

- [ ] **Step 3: Write sdk.ts**

```typescript
// packages/observability/src/node/sdk.ts
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { RuntimeNodeInstrumentation } from '@opentelemetry/instrumentation-runtime-node';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import { diag, DiagLogLevel, DiagConsoleLogger } from '@opentelemetry/api';

let sdk: NodeSDK | undefined;

export function isTelemetryStarted(): boolean {
  return sdk !== undefined;
}

/**
 * Must run before anything requires http/redis/pg/express — auto-instrumentation
 * patches modules at require time, so a late start yields spans with none of the
 * surrounding I/O attached.
 */
export function startTelemetry(serviceName: string): void {
  if (process.env['OTEL_SDK_DISABLED'] === 'true') return;
  if (sdk) return;

  // Exporter failures must be visible but must never reach the app.
  diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.ERROR);

  const endpoint = process.env['OTEL_EXPORTER_OTLP_ENDPOINT'] ?? 'http://localhost:4318';

  try {
    sdk = new NodeSDK({
      resource: resourceFromAttributes({
        [ATTR_SERVICE_NAME]: serviceName,
        [ATTR_SERVICE_VERSION]:
          process.env['GIT_COMMIT_SHA'] ?? process.env['RAILWAY_GIT_COMMIT_SHA'] ?? 'dev',
      }),
      traceExporter: new OTLPTraceExporter({ url: `${endpoint}/v1/traces` }),
      metricReader: new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter({ url: `${endpoint}/v1/metrics` }),
        exportIntervalMillis: 30_000,
      }),
      instrumentations: [
        getNodeAutoInstrumentations({
          // Noisy and worthless here: every file read in a voice pipeline.
          '@opentelemetry/instrumentation-fs': { enabled: false },
        }),
        new RuntimeNodeInstrumentation(),
      ],
    });
    sdk.start();
  } catch (error) {
    sdk = undefined;
    // eslint-disable-next-line no-console
    console.warn('[observability] telemetry failed to start, continuing without it', error);
  }
}

export async function shutdownTelemetry(): Promise<void> {
  if (!sdk) return;
  try {
    await sdk.shutdown();
  } catch {
    // A failed flush must not block process exit.
  } finally {
    sdk = undefined;
  }
}
```

- [ ] **Step 4: Write the node barrel**

```typescript
// packages/observability/src/node/index.ts
export { startTelemetry, shutdownTelemetry, isTelemetryStarted } from './sdk';
export { RainbotAttr } from '../semconv';
```

- [ ] **Step 5: Run the test and watch it pass**

Run: `yarn workspace @rainbot/observability test src/node/__tests__/sdk.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 6: Commit**

```bash
git add packages/observability
git commit -m "feat(observability): SDK bootstrap with disable switch"
```

---

### Task 3: Span helper

**Files:**

- Create: `packages/observability/src/node/spans.ts`
- Modify: `packages/observability/src/node/index.ts`
- Test: `packages/observability/src/node/__tests__/spans.test.ts`

**Interfaces:**

- Consumes: `RainbotAttr`.
- Produces: `withSpan<T>(name: string, attributes: Record<string, string | number | boolean>, fn: () => Promise<T>): Promise<T>` — records exceptions, sets span status, always ends the span.

- [ ] **Step 1: Write the failing test**

```typescript
// packages/observability/src/node/__tests__/spans.test.ts
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { trace, SpanStatusCode } from '@opentelemetry/api';
import { withSpan } from '../spans';
import { RainbotAttr } from '../../semconv';

const exporter = new InMemorySpanExporter();

beforeAll(() => {
  const provider = new BasicTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(exporter)],
  });
  trace.setGlobalTracerProvider(provider);
});

afterEach(() => exporter.reset());

describe('withSpan', () => {
  it('records the result and the attributes', async () => {
    const result = await withSpan(
      'track.resolve',
      { [RainbotAttr.guildId]: '123' },
      async () => 42
    );

    expect(result).toBe(42);
    const [span] = exporter.getFinishedSpans();
    expect(span.name).toBe('track.resolve');
    expect(span.attributes[RainbotAttr.guildId]).toBe('123');
    expect(span.status.code).toBe(SpanStatusCode.UNSET);
  });

  it('records the exception, marks the span as error, and rethrows', async () => {
    await expect(
      withSpan('track.resolve', {}, async () => {
        throw new Error('yt-dlp exited 1');
      })
    ).rejects.toThrow('yt-dlp exited 1');

    const [span] = exporter.getFinishedSpans();
    expect(span.status.code).toBe(SpanStatusCode.ERROR);
    expect(span.events.map((e) => e.name)).toContain('exception');
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `yarn workspace @rainbot/observability test src/node/__tests__/spans.test.ts`
Expected: FAIL — `Cannot find module '../spans'`.

- [ ] **Step 3: Write spans.ts**

```typescript
// packages/observability/src/node/spans.ts
import { trace, SpanStatusCode, type Attributes } from '@opentelemetry/api';

const tracer = trace.getTracer('@rainbot/observability');

/**
 * Wraps an operation in a span. The span always ends, the error is always
 * rethrown — instrumentation must not change control flow.
 */
export async function withSpan<T>(
  name: string,
  attributes: Attributes,
  fn: () => Promise<T>
): Promise<T> {
  return tracer.startActiveSpan(name, { attributes }, async (span) => {
    try {
      return await fn();
    } catch (error) {
      span.recordException(error as Error);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      span.end();
    }
  });
}
```

- [ ] **Step 4: Export it from the barrel**

Add to `packages/observability/src/node/index.ts`:

```typescript
export { withSpan } from './spans';
```

- [ ] **Step 5: Run the test and watch it pass**

Run: `yarn workspace @rainbot/observability test src/node/__tests__/spans.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 6: Commit**

```bash
git add packages/observability
git commit -m "feat(observability): withSpan helper"
```

---

### Task 4: Metric instruments

**Files:**

- Create: `packages/observability/src/node/metrics.ts`
- Modify: `packages/observability/src/node/index.ts`
- Test: `packages/observability/src/node/__tests__/metrics.test.ts`

**Interfaces:**

- Produces, with these exact signatures — Task 9 and Task 11 call them:
  - `recordVoiceConnections(delta: number, attributes: Attributes): void`
  - `recordTrackResolve(durationMs: number, attributes: Attributes): void`
  - `recordTrackResolveFailure(attributes: Attributes): void`
  - `recordRpcDuration(durationMs: number, attributes: Attributes): void`
  - `recordWorkerRegistered(worker: string, registered: boolean): void` — note this one takes the worker name positionally, not an attributes object, because it drives an observable gauge backed by a Map
  - `recordSoundPlay(durationMs: number, attributes: Attributes): void`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/observability/src/node/__tests__/metrics.test.ts
import {
  MeterProvider,
  InMemoryMetricExporter,
  PeriodicExportingMetricReader,
  AggregationTemporality,
} from '@opentelemetry/sdk-metrics';
import { metrics } from '@opentelemetry/api';
import { recordTrackResolveFailure, recordRpcDuration } from '../metrics';
import { RainbotAttr } from '../../semconv';

let exporter: InMemoryMetricExporter;
let reader: PeriodicExportingMetricReader;

beforeAll(() => {
  exporter = new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE);
  reader = new PeriodicExportingMetricReader({ exporter, exportIntervalMillis: 60_000 });
  metrics.setGlobalMeterProvider(new MeterProvider({ readers: [reader] }));
});

describe('metrics', () => {
  it('records a track resolve failure with its source', async () => {
    recordTrackResolveFailure({ [RainbotAttr.trackSource]: 'youtube' });
    await reader.forceFlush();

    const names = exporter
      .getMetrics()
      .flatMap((m) => m.scopeMetrics)
      .flatMap((s) => s.metrics)
      .map((m) => m.descriptor.name);
    expect(names).toContain('rainbot.track.resolve.failures');
  });

  it('records rpc duration', async () => {
    recordRpcDuration(12, { [RainbotAttr.rpcProcedure]: 'playSound' });
    await reader.forceFlush();

    const names = exporter
      .getMetrics()
      .flatMap((m) => m.scopeMetrics)
      .flatMap((s) => s.metrics)
      .map((m) => m.descriptor.name);
    expect(names).toContain('rainbot.worker.rpc.duration');
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `yarn workspace @rainbot/observability test src/node/__tests__/metrics.test.ts`
Expected: FAIL — `Cannot find module '../metrics'`.

- [ ] **Step 3: Write metrics.ts**

```typescript
// packages/observability/src/node/metrics.ts
import { metrics, type Attributes } from '@opentelemetry/api';

const meter = metrics.getMeter('@rainbot/observability');

const voiceConnections = meter.createUpDownCounter('rainbot.voice.connections', {
  description: 'Active voice connections',
});

const trackResolveDuration = meter.createHistogram('rainbot.track.resolve.duration', {
  description: 'Time to resolve a track to a playable stream',
  unit: 'ms',
});

/**
 * The yt-dlp rot signal. yt-dlp breaks against YouTube within weeks of a
 * release, and the weekly image rebuild exists to refresh it. This counter
 * should trend up before playback fails outright.
 */
const trackResolveFailures = meter.createCounter('rainbot.track.resolve.failures', {
  description: 'Track resolutions that failed, by source and error class',
});

const rpcDuration = meter.createHistogram('rainbot.worker.rpc.duration', {
  description: 'Orchestrator to worker RPC duration',
  unit: 'ms',
});

/**
 * Workers retry registration four times and then give up permanently, so a
 * stuck 0 here is actionable and will not resolve on its own.
 */
const workerRegistered = meter.createObservableGauge('rainbot.worker.registered', {
  description: '1 when the worker is registered with the orchestrator, else 0',
});

const registrationState = new Map<string, number>();
workerRegistered.addCallback((observer) => {
  for (const [worker, value] of registrationState) {
    observer.observe(value, { 'rainbot.worker': worker });
  }
});

const soundPlayDuration = meter.createHistogram('rainbot.sound.play.duration', {
  description: 'Soundboard playback duration, split by phase',
  unit: 'ms',
});

export function recordVoiceConnections(delta: number, attributes: Attributes): void {
  voiceConnections.add(delta, attributes);
}

export function recordTrackResolve(durationMs: number, attributes: Attributes): void {
  trackResolveDuration.record(durationMs, attributes);
}

export function recordTrackResolveFailure(attributes: Attributes): void {
  trackResolveFailures.add(1, attributes);
}

export function recordRpcDuration(durationMs: number, attributes: Attributes): void {
  rpcDuration.record(durationMs, attributes);
}

export function recordWorkerRegistered(worker: string, registered: boolean): void {
  registrationState.set(worker, registered ? 1 : 0);
}

export function recordSoundPlay(durationMs: number, attributes: Attributes): void {
  soundPlayDuration.record(durationMs, attributes);
}
```

- [ ] **Step 4: Export from the barrel**

Add to `packages/observability/src/node/index.ts`:

```typescript
export {
  recordVoiceConnections,
  recordTrackResolve,
  recordTrackResolveFailure,
  recordRpcDuration,
  recordWorkerRegistered,
  recordSoundPlay,
} from './metrics';
```

- [ ] **Step 5: Run the test and watch it pass**

Run: `yarn workspace @rainbot/observability test src/node/__tests__/metrics.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 6: Commit**

```bash
git add packages/observability
git commit -m "feat(observability): metric instruments"
```

---

### Task 5: Winston OTLP transport

**Files:**

- Create: `packages/observability/src/node/winstonTransport.ts`
- Modify: `packages/observability/src/node/index.ts`
- Test: `packages/observability/src/node/__tests__/winstonTransport.test.ts`

**Interfaces:**

- Produces: `createOtlpTransport(): Transport | undefined` — returns `undefined` when `OTEL_SDK_DISABLED === 'true'` so callers can spread it into a Winston transport array conditionally.

- [ ] **Step 1: Write the failing test**

```typescript
// packages/observability/src/node/__tests__/winstonTransport.test.ts
import { createOtlpTransport, __emitted } from '../winstonTransport';

describe('createOtlpTransport', () => {
  afterEach(() => {
    __emitted.length = 0;
    delete process.env['OTEL_SDK_DISABLED'];
  });

  it('returns undefined when telemetry is disabled', () => {
    process.env['OTEL_SDK_DISABLED'] = 'true';
    expect(createOtlpTransport()).toBeUndefined();
  });

  it('omits trace context cleanly when no span is active', () => {
    const transport = createOtlpTransport();
    transport!.log!({ level: 'info', message: 'hello' }, () => undefined);

    expect(__emitted[0].attributes['trace_id']).toBeUndefined();
    expect(__emitted[0].body).toBe('hello');
  });

  it('never throws when emission fails', () => {
    const transport = createOtlpTransport();
    const circular: Record<string, unknown> = {};
    circular['self'] = circular;

    expect(() =>
      transport!.log!({ level: 'info', message: 'x', meta: circular }, () => undefined)
    ).not.toThrow();
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `yarn workspace @rainbot/observability test src/node/__tests__/winstonTransport.test.ts`
Expected: FAIL — `Cannot find module '../winstonTransport'`.

- [ ] **Step 3: Write winstonTransport.ts**

```typescript
// packages/observability/src/node/winstonTransport.ts
import Transport from 'winston-transport';
import { trace, context } from '@opentelemetry/api';
import { logs, SeverityNumber } from '@opentelemetry/api-logs';

/** Test seam: emitted records, populated only under jest. */
export const __emitted: Array<{ body: string; attributes: Record<string, unknown> }> = [];

const SEVERITY: Record<string, SeverityNumber> = {
  error: SeverityNumber.ERROR,
  warn: SeverityNumber.WARN,
  info: SeverityNumber.INFO,
  http: SeverityNumber.DEBUG,
  debug: SeverityNumber.DEBUG,
};

class OtlpTransport extends Transport {
  private readonly logger = logs.getLogger('@rainbot/observability');

  override log(info: Record<string, unknown>, next: () => void): void {
    try {
      const attributes: Record<string, unknown> = {};

      // Correlate to the active trace so Grafana can jump log -> trace.
      const span = trace.getSpan(context.active());
      if (span) {
        const ctx = span.spanContext();
        attributes['trace_id'] = ctx.traceId;
        attributes['span_id'] = ctx.spanId;
      }
      if (typeof info['context'] === 'string') {
        attributes['logger'] = info['context'];
      }

      const record = {
        body: String(info['message'] ?? ''),
        severityNumber: SEVERITY[String(info['level'])] ?? SeverityNumber.INFO,
        severityText: String(info['level']),
        attributes,
      };

      if (process.env['NODE_ENV'] === 'test') {
        __emitted.push({ body: record.body, attributes });
      } else {
        this.logger.emit(record);
      }
    } catch {
      // A logging transport that throws inside an error handler is how the
      // original error gets lost. Swallow and move on.
    }
    next();
  }
}

export function createOtlpTransport(): Transport | undefined {
  if (process.env['OTEL_SDK_DISABLED'] === 'true') return undefined;
  return new OtlpTransport();
}
```

Add `"@opentelemetry/api-logs": "^0.218.0"` to the package dependencies.

- [ ] **Step 4: Export from the barrel**

```typescript
export { createOtlpTransport } from './winstonTransport';
```

- [ ] **Step 5: Run the test and watch it pass**

Run: `yarn workspace @rainbot/observability test src/node/__tests__/winstonTransport.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 6: Commit**

```bash
git add packages/observability yarn.lock
git commit -m "feat(observability): winston OTLP transport with trace correlation"
```

---

### Task 6: Wire the transport into both loggers

**Files:**

- Modify: `packages/shared/src/logger.ts` (transports array, near line 70)
- Modify: `packages/shared/package.json` (add dependency)
- Modify: `packages/utils/src/logger.ts` (transports array, near line 115)
- Modify: `packages/utils/package.json` (add dependency)
- Test: `packages/shared/src/__tests__/logger.test.ts`

**Interfaces:**

- Consumes: `createOtlpTransport` from Task 5.
- Produces: no new exports. `createLogger(context)` keeps its existing signature in both modules.

- [ ] **Step 1: Write the failing test**

```typescript
// packages/shared/src/__tests__/logger.test.ts
import { createLogger } from '../logger';

describe('createLogger', () => {
  it('includes an OTLP transport when telemetry is enabled', () => {
    const logger = createLogger('TEST');
    const names = logger.transports.map((t) => t.constructor.name);
    expect(names).toContain('OtlpTransport');
  });

  it('still logs to console', () => {
    const logger = createLogger('TEST');
    const names = logger.transports.map((t) => t.constructor.name);
    expect(names).toContain('Console');
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `yarn build:ts && yarn workspace @rainbot/shared test src/__tests__/logger.test.ts`
Expected: FAIL — `OtlpTransport` not in the transport list.

- [ ] **Step 3: Add the dependency to both packages**

In `packages/shared/package.json` and `packages/utils/package.json`, add to `dependencies`:

```json
"@rainbot/observability": "*"
```

- [ ] **Step 4: Add the transport in packages/shared/src/logger.ts**

At the top of the file, alongside the existing imports:

```typescript
import { createOtlpTransport } from '@rainbot/observability/node';
```

Then change the `transports` array of `winston.createLogger` from:

```typescript
  transports: [
    new winston.transports.Console({
```

to:

```typescript
  transports: [
    // Spread, not push: createOtlpTransport returns undefined when
    // OTEL_SDK_DISABLED is set, and Winston rejects undefined entries.
    ...(createOtlpTransport() ? [createOtlpTransport()!] : []),
    new winston.transports.Console({
```

- [ ] **Step 5: Make the identical change in packages/utils/src/logger.ts**

Same import, same spread, inserted as the first entry of that file's `transports` array.

- [ ] **Step 6: Run the tests and watch them pass**

Run: `yarn build:ts && yarn workspace @rainbot/shared test`
Expected: PASS.

- [ ] **Step 7: Verify the whole repo still builds**

Run: `yarn validate`
Expected: exit 0.

- [ ] **Step 8: Commit**

```bash
git add packages/shared packages/utils yarn.lock
git commit -m "feat(observability): ship winston logs to the collector"
```

---

### Task 7: Bootstrap the three workers

**Files:**

- Modify: `apps/rainbot/src/index.ts` (line 1)
- Modify: `apps/pranjeet/src/index.ts` (line 1)
- Modify: `apps/hungerbot/src/index.ts` (line 1)
- Modify: `apps/{rainbot,pranjeet,hungerbot}/package.json` (add dependency)

**Interfaces:**

- Consumes: `startTelemetry` from Task 2.
- Produces: nothing importable.

- [ ] **Step 1: Add the dependency to all three workers**

In each of `apps/rainbot/package.json`, `apps/pranjeet/package.json`, `apps/hungerbot/package.json`, add to `dependencies`:

```json
"@rainbot/observability": "*"
```

- [ ] **Step 2: Add the bootstrap to apps/rainbot/src/index.ts**

Insert as the **first two lines of the file**, above every other import:

```typescript
import { startTelemetry } from '@rainbot/observability/node';
startTelemetry('rainbot');
```

TypeScript hoists imports, so the `startTelemetry` call is the first statement to execute after the observability module loads — which is what auto-instrumentation needs.

- [ ] **Step 3: Repeat for pranjeet, with its own service name**

```typescript
import { startTelemetry } from '@rainbot/observability/node';
startTelemetry('pranjeet');
```

- [ ] **Step 4: Repeat for hungerbot**

```typescript
import { startTelemetry } from '@rainbot/observability/node';
startTelemetry('hungerbot');
```

- [ ] **Step 5: Verify each worker still starts**

Run: `yarn build:ts && OTEL_SDK_DISABLED=true node apps/hungerbot/dist/index.js`
Expected: the usual startup logs, then it exits or waits on a missing token — no module-resolution or telemetry errors.

- [ ] **Step 6: Commit**

```bash
git add apps/rainbot apps/pranjeet apps/hungerbot yarn.lock
git commit -m "feat(observability): bootstrap telemetry in the three workers"
```

---

### Task 8: Bootstrap raincloud

**Files:**

- Modify: `apps/raincloud/index.js` (line 1)
- Modify: `apps/raincloud/package.json` (add dependency)

**Interfaces:**

- Consumes: `startTelemetry` from Task 2.

- [ ] **Step 1: Add the dependency**

Add `"@rainbot/observability": "*"` to `apps/raincloud/package.json` dependencies.

- [ ] **Step 2: Add the bootstrap as the first statement of apps/raincloud/index.js**

This file monkeypatches `Module._resolveFilename` to map `@server`/`@handlers`/etc to `dist/`. The telemetry bootstrap goes **above** that patch, because auto-instrumentation must patch `http` before any aliased module loads:

```javascript
// Telemetry first: auto-instrumentation patches http/redis/pg at require time,
// so anything required above this line is invisible to tracing.
require('@rainbot/observability/node').startTelemetry('raincloud');
```

- [ ] **Step 3: Verify raincloud still resolves its aliases**

Run: `yarn build:ts && OTEL_SDK_DISABLED=true node apps/raincloud/index.js`
Expected: startup proceeds to the Discord login step. If it fails with `Cannot find module '@server/...'`, the bootstrap was placed below the monkeypatch — move it up.

- [ ] **Step 4: Commit**

```bash
git add apps/raincloud yarn.lock
git commit -m "feat(observability): bootstrap telemetry in raincloud"
```

---

### Task 9: Worker RPC spans and the registration gauge

**Files:**

- Modify: `packages/rpc/src/client.ts` (client span)
- Modify: `packages/rpc/src/trpc.ts` (server span)
- Modify: `packages/worker-shared/src/orchestrator.ts:79-105` (registration gauge)
- Modify: `packages/rpc/package.json`, `packages/worker-shared/package.json` (add dependency)
- Test: `packages/worker-shared/src/__tests__/orchestrator.telemetry.test.ts`

**Interfaces:**

- Consumes: `withSpan`, `recordRpcDuration`, `recordWorkerRegistered`, `RainbotAttr`.

- [ ] **Step 1: Write the failing test**

```typescript
// packages/worker-shared/src/__tests__/orchestrator.telemetry.test.ts
import { recordWorkerRegistered } from '@rainbot/observability/node';

jest.mock('@rainbot/observability/node', () => ({
  ...jest.requireActual('@rainbot/observability/node'),
  recordWorkerRegistered: jest.fn(),
}));

describe('worker registration telemetry', () => {
  beforeEach(() => jest.clearAllMocks());

  it('records 0 when registration is skipped for missing config', async () => {
    const { registerWithOrchestrator } = await import('../orchestrator');
    delete process.env['RAINCLOUD_URL'];

    await registerWithOrchestrator({ worker: 'rainbot' } as never);

    expect(recordWorkerRegistered).toHaveBeenCalledWith('rainbot', false);
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `yarn build:ts && yarn workspace @rainbot/worker-shared test src/__tests__/orchestrator.telemetry.test.ts`
Expected: FAIL — `recordWorkerRegistered` not called.

- [ ] **Step 3: Add the dependency to both packages**

Add `"@rainbot/observability": "*"` to `packages/rpc/package.json` and `packages/worker-shared/package.json` dependencies.

- [ ] **Step 4: Record the registration gauge in orchestrator.ts**

In the early-return branch where `RAINCLOUD_URL` or `WORKER_SECRET` is missing, before returning:

```typescript
recordWorkerRegistered(workerName, false);
```

After a successful registration response:

```typescript
recordWorkerRegistered(workerName, true);
```

And in the final catch, after the retry budget is exhausted:

```typescript
recordWorkerRegistered(workerName, false);
```

- [ ] **Step 5: Add the client span in packages/rpc/src/client.ts**

Wrap the outgoing call so every orchestrator-to-worker RPC is timed:

```typescript
import { withSpan, recordRpcDuration, RainbotAttr } from '@rainbot/observability/node';

// inside the call wrapper, replacing the direct invocation:
const started = Date.now();
try {
  return await withSpan(
    'worker.rpc',
    { [RainbotAttr.rpcProcedure]: procedure, [RainbotAttr.worker]: workerName },
    () => invoke()
  );
} finally {
  recordRpcDuration(Date.now() - started, {
    [RainbotAttr.rpcProcedure]: procedure,
    [RainbotAttr.worker]: workerName,
  });
}
```

- [ ] **Step 6: Run the test and watch it pass**

Run: `yarn build:ts && yarn workspace @rainbot/worker-shared test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/rpc packages/worker-shared yarn.lock
git commit -m "feat(observability): rpc spans and worker registration gauge"
```

---

### Task 10: Track resolution and queue spans

**Files:**

- Modify: `apps/rainbot/src/voice/trackFetcher.ts`
- Modify: `apps/rainbot/src/voice/audioResource.ts`
- Modify: `packages/utils/src/voice/queueManager.ts` (`withQueueLock`)
- Test: `packages/utils/src/voice/__tests__/queueManager.telemetry.test.ts`

**Interfaces:**

- Consumes: `withSpan`, `recordTrackResolve`, `recordTrackResolveFailure`, `RainbotAttr`.

- [ ] **Step 1: Write the failing test**

```typescript
// packages/utils/src/voice/__tests__/queueManager.telemetry.test.ts
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { trace } from '@opentelemetry/api';
import { withQueueLock } from '../queueManager';

const exporter = new InMemorySpanExporter();

beforeAll(() => {
  trace.setGlobalTracerProvider(
    new BasicTracerProvider({ spanProcessors: [new SimpleSpanProcessor(exporter)] })
  );
});

afterEach(() => exporter.reset());

it('emits a queue.mutate span around the locked section', async () => {
  await withQueueLock('guild-1', async () => undefined);

  const span = exporter.getFinishedSpans().find((s) => s.name === 'queue.mutate');
  expect(span).toBeDefined();
  expect(span!.attributes['rainbot.guild_id']).toBe('guild-1');
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `yarn build:ts && yarn workspace @rainbot/utils test src/voice/__tests__/queueManager.telemetry.test.ts`
Expected: FAIL — no `queue.mutate` span.

- [ ] **Step 3: Wrap withQueueLock**

In `packages/utils/src/voice/queueManager.ts`, wrap the body of `withQueueLock` — the lock acquisition stays inside the span so lock wait time is measured:

```typescript
import { withSpan, RainbotAttr } from '@rainbot/observability/node';

export async function withQueueLock<T>(guildId: string, fn: () => Promise<T>): Promise<T> {
  return withSpan('queue.mutate', { [RainbotAttr.guildId]: guildId }, async () => {
    // existing lock acquisition and fn() invocation, unchanged
  });
}
```

- [ ] **Step 4: Instrument track resolution in apps/rainbot/src/voice/trackFetcher.ts**

Wrap the `youtube-dl-exec` invocation:

```typescript
import {
  withSpan,
  recordTrackResolve,
  recordTrackResolveFailure,
  RainbotAttr,
} from '@rainbot/observability/node';

const started = Date.now();
try {
  const result = await withSpan(
    'track.resolve',
    {
      [RainbotAttr.trackUrl]: url,
      [RainbotAttr.trackSource]: source,
      [RainbotAttr.proxyUsed]: Boolean(process.env['YTDLP_PROXY']),
    },
    () => ytdlp(url, options)
  );
  recordTrackResolve(Date.now() - started, { [RainbotAttr.trackSource]: source });
  return result;
} catch (error) {
  recordTrackResolveFailure({
    [RainbotAttr.trackSource]: source,
    [RainbotAttr.outcome]: error instanceof Error ? error.name : 'unknown',
  });
  throw error;
}
```

- [ ] **Step 5: Instrument audio resource creation in apps/rainbot/src/voice/audioResource.ts**

Wrap the two `createAudioResource` call sites (around lines 149 and 223). The
interesting attribute is whether the stream type forced an ffmpeg transcode —
`StreamType.Arbitrary` does, Opus does not, and that is the difference between
cheap playback and a spawned process per track:

```typescript
import { withSpan, RainbotAttr } from '@rainbot/observability/node';

return withSpan(
  'audio.resource.create',
  {
    'rainbot.stream_type': inputType,
    'rainbot.transcoded': inputType === StreamType.Arbitrary,
    [RainbotAttr.trackSource]: source,
  },
  async () => createAudioResource(stream, { inputType })
);
```

- [ ] **Step 6: Run the tests and watch them pass**

Run: `yarn build:ts && yarn workspace @rainbot/utils test`
Expected: PASS, including the existing `withQueueLock` tests — the span must not change locking behaviour.

- [ ] **Step 7: Commit**

```bash
git add packages/utils apps/rainbot
git commit -m "feat(observability): track resolution, audio resource and queue spans"
```

---

### Task 11: Voice, sound, TTS and Grok spans

**Files:**

- Modify: `packages/worker-shared/src/voiceRpcHandlers.ts` (voice.join, sound.play)
- Modify: `apps/hungerbot/src/handlers/rpc.ts` (R2 fetch timing)
- Modify: `apps/pranjeet/src/speak.ts` (tts.speak)
- Modify: `apps/pranjeet/src/voice-agent/*` (grok.converse)

**Interfaces:**

- Consumes: `withSpan`, `recordVoiceConnections`, `recordSoundPlay`, `RainbotAttr`.

- [ ] **Step 1: Instrument voice.join in packages/worker-shared/src/voiceRpcHandlers.ts**

```typescript
import { withSpan, recordVoiceConnections, RainbotAttr } from '@rainbot/observability/node';

await withSpan(
  'voice.join',
  { [RainbotAttr.guildId]: guildId, [RainbotAttr.voiceChannel]: channelId },
  async () => {
    const connection = await joinVoice(guildId, channelId);
    recordVoiceConnections(1, { [RainbotAttr.guildId]: guildId });
    return connection;
  }
);
```

At the corresponding leave/disconnect handler: `recordVoiceConnections(-1, { [RainbotAttr.guildId]: guildId })`.

- [ ] **Step 2: Instrument sound.play in apps/hungerbot/src/handlers/rpc.ts**

The R2 fetch and the playback are timed separately, because a slow bucket and a slow decode are different problems:

```typescript
import { withSpan, recordSoundPlay, RainbotAttr } from '@rainbot/observability/node';

await withSpan(
  'sound.play',
  { [RainbotAttr.sound]: soundName, [RainbotAttr.guildId]: guildId },
  async () => {
    const fetchStarted = Date.now();
    const stream = await getSoundStream(soundName);
    recordSoundPlay(Date.now() - fetchStarted, {
      [RainbotAttr.sound]: soundName,
      phase: 'fetch',
    });

    const playStarted = Date.now();
    const result = await playStream(stream);
    recordSoundPlay(Date.now() - playStarted, {
      [RainbotAttr.sound]: soundName,
      phase: 'play',
    });
    return result;
  }
);
```

- [ ] **Step 3: Instrument tts.speak in apps/pranjeet/src/speak.ts**

```typescript
await withSpan(
  'tts.speak',
  {
    'rainbot.tts_provider': provider,
    'rainbot.tts_voice': voice,
    'rainbot.text_length': text.length,
  },
  () => synthesize(text)
);
```

- [ ] **Step 4: Instrument grok.converse in the pranjeet voice agent**

```typescript
await withSpan(
  'grok.converse',
  { 'rainbot.grok_model': model, [RainbotAttr.guildId]: guildId },
  () => callGrok(messages)
);
```

- [ ] **Step 5: Verify nothing regressed**

Run: `yarn validate`
Expected: exit 0, all 151 existing tests still pass.

- [ ] **Step 6: Commit**

```bash
git add packages apps
git commit -m "feat(observability): voice, sound, tts and grok spans"
```

---

### Task 12: Deploy and verify against the live collector

**Files:**

- Modify: Dokploy env for all four bot applications (via API or UI)

**Interfaces:**

- Consumes: everything above.

- [ ] **Step 1: Add the telemetry env to all four bots**

Append to each application's env in Dokploy:

```
OTEL_EXPORTER_OTLP_ENDPOINT=http://telemetry-otel-collector-wyuddq-c1orqh:4318
OTEL_SERVICE_NAME=<raincloud|rainbot|pranjeet|hungerbot>
```

- [ ] **Step 2: Merge and let CI build the images**

Open the PR, merge it, and wait for `build-images.yml` to go green. All five images rebuild, because `packages/` is in every service's content hash.

- [ ] **Step 3: Deploy in dependency order**

Databases are already running. Deploy raincloud first, wait for `/health/ready` to report `ready:true`, then the three workers. Workers started before the orchestrator is healthy burn their four registration retries and never re-register.

- [ ] **Step 4: Verify auto-instrumentation actually attached**

In Grafana, query Tempo for `service.name="raincloud"`. A trace for an `/api/*` request must contain child spans for the Redis and Postgres calls. If the root span is childless, the bootstrap ran too late — check it is above the `Module._resolveFilename` patch in `apps/raincloud/index.js`.

- [ ] **Step 5: Verify log correlation**

In Grafana, open a `track.resolve` trace and use the Loki correlation to jump to its logs. Log lines from that operation must carry the matching `trace_id`.

- [ ] **Step 6: Verify the registration gauge**

Query Prometheus for `rainbot_worker_registered`. All three workers must read 1. Restart one worker while raincloud is stopped and confirm it reads 0 — this is the alert condition that matters, so it should be proven rather than assumed.

- [ ] **Step 7: Verify a cross-service trace**

Play a track from the dashboard. One trace should span raincloud → `worker.rpc` → rainbot → `track.resolve`. If the trace breaks at the RPC boundary, context propagation is not crossing the tRPC client, and Task 9's client span needs the active context passed explicitly.

---

## What this plan does not cover

The browser half of the spec — the authenticated OTLP proxy route on raincloud, the web SDK, and the three UI seams (ErrorBoundary reporting, the `api` axios interceptor, mutation keys) — is a separate plan written after this one is deployed and verified.

Grafana dashboards and alert rules are out of scope by design: build views against real data rather than guessing thresholds.
