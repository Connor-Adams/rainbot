import { log } from './config';
import { startBatchProcessor } from './batch';
import { apiLatencyBuffer } from './store';

/**
 * Track API endpoint latency
 */
export function trackApiLatency(
  endpoint: string,
  method: string,
  responseTimeMs: number,
  statusCode: number | null = null,
  userId: string | null = null,
  requestSizeBytes: number | null = null,
  responseSizeBytes: number | null = null
): void {
  try {
    apiLatencyBuffer.push({
      endpoint,
      method,
      response_time_ms: responseTimeMs,
      status_code: statusCode,
      user_id: userId,
      request_size_bytes: requestSizeBytes,
      response_size_bytes: responseSizeBytes,
      created_at: new Date(),
    });

    log.debug(`Tracked API latency: ${method} ${endpoint} - ${responseTimeMs}ms`);
    startBatchProcessor();
  } catch (error) {
    const err = error as Error;
    log.error(`Failed to track API latency: ${err.message}`);
  }
}
