export declare class RedisClient {
  private client;
  private connected;
  connect(url?: string): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  private ensureConnected;
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
  del(key: string): Promise<number>;
  exists(key: string): Promise<number>;
  expire(key: string, ttlSeconds: number): Promise<boolean>;
  ttl(key: string): Promise<number>;
  keys(pattern: string): Promise<string[]>;
  hSet(key: string, field: string, value: string): Promise<number>;
  hGet(key: string, field: string): Promise<string | undefined>;
  hGetAll(key: string): Promise<Record<string, string>>;
  hDel(key: string, field: string): Promise<number>;
  /**
   * Ping the Redis server to check if it's alive
   */
  ping(): Promise<string>;
}
/**
 * Get or create the Redis client singleton
 */
export declare function getRedisClient(): RedisClient;
/**
 * Initialize and connect the Redis client
 */
export declare function initializeRedis(url?: string): Promise<RedisClient>;
//# sourceMappingURL=client.d.ts.map
