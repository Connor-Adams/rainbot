/**
 * SSE registry for bot-status updates (connections, volume, etc.).
 * Only sends events when status changes (e.g. volume set); no heartbeats when idle.
 */

import type { Response } from 'express';
import { createLogger } from '@utils/logger';

const log = createLogger('SSE-STATUS');

/** Set of response objects (SSE connections) subscribed to status updates. */
const subscribers = new Set<Response>();

/**
 * Add an SSE subscriber for status updates. Res is kept open; remove when client closes.
 */
export function addStatusSubscriber(res: Response): void {
  subscribers.add(res);
  res.on('close', () => {
    subscribers.delete(res);
  });
  res.on('error', () => {
    subscribers.delete(res);
  });
}

/**
 * Send current status to a single SSE client (e.g. initial snapshot on connect).
 */
export function sendStatusSnapshotToClient(res: Response, status: unknown): void {
  if (res.writableEnded) return;
  const payload = JSON.stringify({ event: 'status', data: status });
  res.write(`data: ${payload}\n\n`);
}

/**
 * Broadcast current status to all SSE subscribers.
 * Call this after volume change or other status-affecting mutations.
 */
export async function broadcastStatusUpdate(getStatus: () => Promise<unknown>): Promise<void> {
  if (subscribers.size === 0) return;

  try {
    const status = await getStatus();
    const payload = JSON.stringify({ event: 'status', data: status });
    const message = `data: ${payload}\n\n`;

    for (const res of subscribers) {
      if (!res.writableEnded) {
        res.write(message);
      }
    }
  } catch (err) {
    log.debug(`Broadcast status update failed: ${(err as Error).message}`);
  }
}
