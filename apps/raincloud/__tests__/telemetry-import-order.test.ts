import fs from 'fs';
import path from 'path';

/**
 * Raincloud's telemetry bootstrap isn't guarded by TypeScript import ordering
 * the way the three workers' index.ts files are (see the matching
 * telemetry-import-order tests under apps/{rainbot,pranjeet,hungerbot}/src/__tests__):
 * index.js is plain CommonJS with hand-ordered `require()` calls, including
 * the `Module._resolveFilename` alias monkeypatch the rest of the file
 * depends on. A `require()` inserted above `startTelemetry()` — even
 * something as innocuous-looking as another config helper — makes everything
 * it pulls in invisible to auto-instrumentation, exactly like the worker
 * case, but nothing here would catch it. dotenv is the sole permitted
 * exception: startTelemetry() reads OTEL_SDK_DISABLED /
 * OTEL_EXPORTER_OTLP_ENDPOINT synchronously at call time, so a value set only
 * in a local .env must already be in process.env before that call.
 */
describe('raincloud telemetry import ordering', () => {
  it('requires @rainbot/observability/node and starts telemetry before every other require except dotenv', () => {
    const indexPath = path.join(__dirname, '..', 'index.js');
    const source = fs.readFileSync(indexPath, 'utf8');
    const lines = source.split('\n');

    const requireRe = /require\(\s*['"]([^'"]+)['"]\s*\)/g;
    const requires: Array<{ line: number; module: string }> = [];
    lines.forEach((lineText, index) => {
      requireRe.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = requireRe.exec(lineText))) {
        requires.push({ line: index, module: match[1]! });
      }
    });

    const observabilityEntry = requires.find(
      (entry) => entry.module === '@rainbot/observability/node'
    );
    expect(observabilityEntry).toBeDefined();

    // Match the real call (`observability.startTelemetry(...)`), not the
    // mentions of `startTelemetry()` in surrounding comments.
    const startTelemetryLine = lines.findIndex((lineText) =>
      /^\s*observability\.startTelemetry\(/.test(lineText)
    );
    expect(startTelemetryLine).toBeGreaterThan(-1);
    // The bootstrap is "require + call", both of which must precede
    // everything else — a require() inserted between them would still be a
    // regression even though it comes after the require line itself.
    expect(startTelemetryLine).toBeGreaterThanOrEqual(observabilityEntry!.line);

    for (const entry of requires) {
      if (entry.module === '@rainbot/observability/node') continue;
      if (entry.module === 'dotenv') {
        expect(entry.line).toBeLessThan(observabilityEntry!.line);
        continue;
      }
      // Everything else — including `path`/`module` (the Module._resolveFilename
      // alias monkeypatch) and every app require below it — must come after
      // telemetry has actually started, not just after the require() line.
      expect(entry.line).toBeGreaterThan(startTelemetryLine);
    }
  });

  it('starts telemetry under the tenant-qualified service name', () => {
    const indexPath = path.join(__dirname, '..', 'index.js');
    const source = fs.readFileSync(indexPath, 'utf8');

    expect(source).toContain("observability.startTelemetry('rainbot-raincloud')");
  });
});
