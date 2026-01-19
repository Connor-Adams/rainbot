/**
 * Request cache for idempotency with TTL (Time To Live)
 */
export class RequestCache {
  private cache = new Map<string, unknown>();

  /**
   * Check if a request ID exists in the cache
   */
  has(requestId: string): boolean {
    return this.cache.has(requestId);
  }

  /**
   * Get a cached response for a request ID
   */
  get(requestId: string): unknown | undefined {
    return this.cache.get(requestId);
  }

  /**
   * Cache a response for a request ID with a TTL (default 60 seconds)
   */
  set(requestId: string, response: unknown, ttlMs: number = 60000): void {
    this.cache.set(requestId, response);
    setTimeout(() => {
      this.cache.delete(requestId);
    }, ttlMs);
  }

  /**
   * Clear all cached responses
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get the current size of the cache
   */
  size(): number {
    return this.cache.size;
  }
}
