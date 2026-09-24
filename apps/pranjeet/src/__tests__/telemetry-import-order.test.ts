import fs from 'fs';
import path from 'path';

/**
 * Deferred-3 guard: this worker's auto-instrumentation only patches modules
 * required after `startTelemetry()` runs, so `import './telemetry';` must be
 * the very first import in index.ts. If a future edit inserts an import
 * above it, tracing silently loses http/redis/discord instrumentation —
 * spans still emit, just with no auto-instrumented children. Nothing else
 * catches that, so this test reads the source directly rather than relying
 * on convention. See the comment above the telemetry import in index.ts for
 * why a `--require` preload (the structurally-safe fix) was deferred instead
 * of this guard.
 */
describe('telemetry import ordering', () => {
  it('imports ./telemetry as the very first import in index.ts', () => {
    const indexPath = path.join(__dirname, '..', 'index.ts');
    const source = fs.readFileSync(indexPath, 'utf8');
    const importLines = source
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith('import '));

    expect(importLines.length).toBeGreaterThan(0);
    expect(importLines[0]).toBe("import './telemetry';");
  });
});
