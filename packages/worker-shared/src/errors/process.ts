import { createLogger } from '@rainbot/shared';
import { isTelemetryStarted, shutdownTelemetry } from '@rainbot/observability/node';
import { logErrorWithStack } from './logging';

/** Grace period so the logger can flush before the process goes away. */
const EXIT_DELAY_MS = 250;

/**
 * Setup process-level error handlers for unhandled rejections and uncaught exceptions
 *
 * An uncaught exception leaves the process in an undefined state — a worker that
 * keeps running after one is typically half-dead (e.g. its voice websocket is
 * gone) and has to be rebooted by hand. Exit instead and let the platform
 * restart a clean process.
 */
export function setupProcessErrorHandlers(logger: ReturnType<typeof createLogger>): void {
  process.on('unhandledRejection', (reason) => {
    logErrorWithStack(logger, 'Unhandled promise rejection', reason);
  });

  process.on('uncaughtException', (error) => {
    logErrorWithStack(logger, 'Uncaught exception', error);
    setTimeout(() => process.exit(1), EXIT_DELAY_MS).unref();
  });

  // OTEL_SDK_DISABLED=true means startTelemetry() never ran, so there is no
  // in-flight span/metric batch to flush. Skip attaching SIGTERM/SIGINT
  // listeners entirely in that case rather than attaching ones that do
  // nothing — Node suppresses its own default terminate-on-signal behavior
  // as soon as any listener is registered, so a no-op handler would leave a
  // disabled service's shutdown behavior worse, not merely inert.
  if (!isTelemetryStarted()) return;

  const shutdownAndExit = (signal: NodeJS.Signals): void => {
    logger.info(`Received ${signal}, flushing telemetry before exit`);
    // shutdownTelemetry() is itself bounded (see packages/observability) and
    // already swallows its own errors, so this always settles — a hung or
    // failing collector connection can never keep this process alive past a
    // redeploy's grace period. The .catch() here is defense in depth: this
    // shutdown path must never itself become an unhandled rejection.
    void shutdownTelemetry()
      .catch(() => {})
      .finally(() => process.exit(0));
  };

  process.once('SIGTERM', () => shutdownAndExit('SIGTERM'));
  process.once('SIGINT', () => shutdownAndExit('SIGINT'));
}
