// Imported first by index.ts, before anything else. Import side effects run in
// order, so this module's body executes before index.ts's later imports are
// evaluated — which is what auto-instrumentation needs, since it patches
// modules at require time.
import { startTelemetry } from '@rainbot/observability/node';

startTelemetry('rainbot-pranjeet');
