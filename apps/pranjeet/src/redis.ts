/**
 * Redis client for conversation mode and Grok response_id.
 * Uses same REDIS_URL as TTS queue; lazy connect on first use.
 */
import IORedis from 'ioredis';
import { REDIS_URL } from './config';

let client: IORedis | null = null;

function getClient(): IORedis | null {
  if (!REDIS_URL) return null;
  if (!client) {
    client = new IORedis(REDIS_URL, {
      maxRetriesPerRequest: 3,
      connectTimeout: 10_000,
      retryStrategy: (times: number) => (times > 5 ? null : Math.min(1000 * 2 ** times, 10_000)),
    });
    client.on('error', (err: Error) => {
      // Log at debug to avoid noise; caller handles null
      if (process.env['NODE_ENV'] === 'development') {
        console.warn(`[pranjeet redis] ${err.message}`);
      }
    });
  }
  return client;
}

const CONVERSATION_KEY_PREFIX = 'conversation:';
const GROK_RESPONSE_ID_KEY_PREFIX = 'grok:response_id:';

export async function getConversationMode(guildId: string, userId: string): Promise<boolean> {
  const c = getClient();
  if (!c) return false;
  try {
    const key = `${CONVERSATION_KEY_PREFIX}${guildId}:${userId}`;
    const value = await c.get(key);
    return value === '1';
  } catch {
    return false;
  }
}

export async function getGrokResponseId(guildId: string, userId: string): Promise<string | null> {
  const c = getClient();
  if (!c) return null;
  try {
    const key = `${GROK_RESPONSE_ID_KEY_PREFIX}${guildId}:${userId}`;
    return await c.get(key);
  } catch {
    return null;
  }
}

export async function setGrokResponseId(
  guildId: string,
  userId: string,
  responseId: string
): Promise<void> {
  const c = getClient();
  if (!c) return;
  try {
    const key = `${GROK_RESPONSE_ID_KEY_PREFIX}${guildId}:${userId}`;
    await c.set(key, responseId);
  } catch {
    // ignore
  }
}

export async function clearGrokResponseId(guildId: string, userId: string): Promise<void> {
  const c = getClient();
  if (!c) return;
  try {
    const key = `${GROK_RESPONSE_ID_KEY_PREFIX}${guildId}:${userId}`;
    await c.del(key);
  } catch {
    // ignore
  }
}
