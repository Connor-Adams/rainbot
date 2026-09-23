// Note: the brief for this test used `createLogger('TEST').transports`, but
// `createLogger` returns the `Logger` interface (error/warn/info/http/debug
// methods only, from @rainbot/protocol) — it has no `transports` property and
// that would fail to type-check. The winston `Logger` instance that actually
// holds the transports array is the module's `logger` export, so this test
// exercises that instead. No new export was added: `logger` was already
// exported from '../logger'.
import { logger } from '../logger';

describe('logger transports', () => {
  it('includes an OTLP transport when telemetry is enabled', () => {
    const names = logger.transports.map((t) => t.constructor.name);
    expect(names).toContain('OtlpTransport');
  });

  it('still logs to console', () => {
    const names = logger.transports.map((t) => t.constructor.name);
    expect(names).toContain('Console');
  });
});
