/**
 * SSE registry for queue/now-playing updates per guild.
 * Only sends events when playback state changes (no heartbeats when idle).
 */

import type { Response } from 'express';
import type { QueueState } from '@rainbot/types/media';
import { createLogger } from '@utils/logger';

const log = createLogger('SSE-QUEUE');

/** Map guildId -> Set of response objects (SSE connections). */
const subscribersByGuild = new Map<string, Set<Response>>();

function getSubscribers(guildId: string): Set<Response> {
  let set = subscribersByGuild.get(guildId);
  if (!set) {
    set = new Set();
    subscribersByGuild.set(guildId, set);
  }
  return set;
}

/**
 * Add an SSE subscriber for a guild. Res is kept open; remove when client closes.
 */
export function addQueueSubscriber(guildId: string, res: Response): void {
  const set = getSubscribers(guildId);
  set.add(res);

  const remove = (): void => {
    set.delete(res);
    if (set.size === 0) {
      subscribersByGuild.delete(guildId);
    }
  };

  res.on('close', remove);
  res.on('error', remove);
}

/**
 * Remove an SSE subscriber (e.g. on explicit unsubscribe).
 */
export function removeQueueSubscriber(guildId: string, res: Response): void {
  const set = subscribersByGuild.get(guildId);
  if (set) {
    set.delete(res);
    if (set.size === 0) {
      subscribersByGuild.delete(guildId);
    }
  }
}

/**
 * Send current queue state to a single SSE client (e.g. initial snapshot on connect).
 */
export function sendQueueSnapshotToClient(res: Response, queue: QueueState): void {
  if (res.writableEnded) return;
  const payload = JSON.stringify({ event: 'queue', data: queue });
  res.write(`data: ${payload}\n\n`);
}

/**
 * Broadcast current queue state to all SSE subscribers for a guild.
 * Call this after play, pause, skip, seek, stop, clear, or remove.
 * Only sends when there are subscribers; no-op when none (reduces overhead).
 */
export async function broadcastQueueUpdate(
  guildId: string,
  getQueue: (guildId: string) => Promise<QueueState>
): Promise<void> {
  const set = subscribersByGuild.get(guildId);
  if (!set || set.size === 0) return;

  try {
    const queue = await getQueue(guildId);
    const payload = JSON.stringify({ event: 'queue', data: queue });
    const message = `data: ${payload}\n\n`;

    for (const res of set) {
      if (!res.writableEnded) {
        res.write(message);
      }
    }
  } catch (err) {
    log.debug(`Broadcast queue update failed for guild ${guildId}: ${(err as Error).message}`);
  }
}
