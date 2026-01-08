'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.RedisClient = void 0;
exports.getRedisClient = getRedisClient;
exports.initializeRedis = initializeRedis;
const redis_1 = require('redis');
const shared_1 = require('@rainbot/shared');
const log = (0, shared_1.createLogger)('REDIS');
class RedisClient {
  client = null;
  connected = false;
  async connect(url) {
    const redisUrl = url || process.env['REDIS_URL'] || 'redis://localhost:6379';
    try {
      this.client = (0, redis_1.createClient)({ url: redisUrl });
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
      log.error(`Failed to connect to Redis: ${error.message}`);
      throw error;
    }
  }
  async disconnect() {
    if (this.client) {
      await this.client.quit();
      this.client = null;
      this.connected = false;
      log.info('Redis disconnected');
    }
  }
  isConnected() {
    return this.connected;
  }
  ensureConnected() {
    if (!this.client || !this.connected) {
      throw new Error('Redis client is not connected');
    }
  }
  async get(key) {
    this.ensureConnected();
    return await this.client.get(key);
  }
  async set(key, value, ttlSeconds) {
    this.ensureConnected();
    if (ttlSeconds) {
      await this.client.setEx(key, ttlSeconds, value);
    } else {
      await this.client.set(key, value);
    }
  }
  async del(key) {
    this.ensureConnected();
    return await this.client.del(key);
  }
  async exists(key) {
    this.ensureConnected();
    return await this.client.exists(key);
  }
  async expire(key, ttlSeconds) {
    this.ensureConnected();
    return await this.client.expire(key, ttlSeconds);
  }
  async ttl(key) {
    this.ensureConnected();
    return await this.client.ttl(key);
  }
  async keys(pattern) {
    this.ensureConnected();
    return await this.client.keys(pattern);
  }
  async hSet(key, field, value) {
    this.ensureConnected();
    return await this.client.hSet(key, field, value);
  }
  async hGet(key, field) {
    this.ensureConnected();
    return await this.client.hGet(key, field);
  }
  async hGetAll(key) {
    this.ensureConnected();
    return await this.client.hGetAll(key);
  }
  async hDel(key, field) {
    this.ensureConnected();
    return await this.client.hDel(key, field);
  }
  /**
   * Ping the Redis server to check if it's alive
   */
  async ping() {
    this.ensureConnected();
    return await this.client.ping();
  }
}
exports.RedisClient = RedisClient;
// Singleton instance
let instance = null;
/**
 * Get or create the Redis client singleton
 */
function getRedisClient() {
  if (!instance) {
    instance = new RedisClient();
  }
  return instance;
}
/**
 * Initialize and connect the Redis client
 */
async function initializeRedis(url) {
  const client = getRedisClient();
  if (!client.isConnected()) {
    await client.connect(url);
  }
  return client;
}
//# sourceMappingURL=client.js.map
