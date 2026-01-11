import { createClient, RedisClientType } from 'redis';
import { createLogger } from '@rainbot/shared';
import process from 'node:process';

const log = createLogger('REDIS');

export class RedisClient {
  private client: RedisClientType | null = null;
  private connected = false;

  async connect(url?: string): Promise<void> {
    const redisUrl = url || process.env['REDIS_URL'] || 'redis://localhost:6379';

    try {
      this.client = createClient({ url: redisUrl });

      this.client.on('error', (err) => {
        log.error(`Redis error: ${err.message}`);
      });

      this.client.on('connect', () => {
        log.info('Redis client connecting...');
      });

      this.client.on('ready', () => {
        this.connected = true;
        log.info('Redis client ready');
      });

      this.client.on('end', () => {
        this.connected = false;
        log.warn('Redis connection closed');
      });

      await this.client.connect();
      log.info(`Redis connected to ${redisUrl}`);
    } catch (error) {
      log.error(`Failed to connect to Redis: ${(error as Error).message}`);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      this.client = null;
      this.connected = false;
      log.info('Redis disconnected');
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  private ensureConnected(): void {
    if (!this.client || !this.connected) {
      throw new Error('Redis client is not connected');
    }
  }

  async get(key: string): Promise<string | null> {
    this.ensureConnected();
    return await this.client!.get(key);
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    this.ensureConnected();
    if (ttlSeconds) {
      await this.client!.setEx(key, ttlSeconds, value);
    } else {
      await this.client!.set(key, value);
    }
  }

  async del(key: string): Promise<number> {
    this.ensureConnected();
    return await this.client!.del(key);
  }

  async exists(key: string): Promise<number> {
    this.ensureConnected();
    return await this.client!.exists(key);
  }

  async expire(key: string, ttlSeconds: number): Promise<boolean> {
    this.ensureConnected();
    return await this.client!.expire(key, ttlSeconds);
  }

  async ttl(key: string): Promise<number> {
    this.ensureConnected();
    return await this.client!.ttl(key);
  }

  async keys(pattern: string): Promise<string[]> {
    this.ensureConnected();
    return await this.client!.keys(pattern);
  }

  async hSet(key: string, field: string, value: string): Promise<number> {
    this.ensureConnected();
    return await this.client!.hSet(key, field, value);
  }

  async hGet(key: string, field: string): Promise<string | undefined> {
    this.ensureConnected();
    return await this.client!.hGet(key, field);
  }

  async hGetAll(key: string): Promise<Record<string, string>> {
    this.ensureConnected();
    return await this.client!.hGetAll(key);
  }

  async hDel(key: string, field: string): Promise<number> {
    this.ensureConnected();
    return await this.client!.hDel(key, field);
  }

  /**
   * Ping the Redis server to check if it's alive
   */
  async ping(): Promise<string> {
    this.ensureConnected();
    return await this.client!.ping();
  }
}

// Singleton instance
let instance: RedisClient | null = null;

/**
 * Get or create the Redis client singleton
 */
export function getRedisClient(): RedisClient {
  if (!instance) {
    instance = new RedisClient();
  }
  return instance;
}

/**
 * Initialize and connect the Redis client
 */
export async function initializeRedis(url?: string): Promise<RedisClient> {
  const client = getRedisClient();
  if (!client.isConnected()) {
    await client.connect(url);
  }
  return client;
}
