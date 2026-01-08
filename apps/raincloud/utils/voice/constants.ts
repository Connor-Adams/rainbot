/**
 * Voice manager constants
 */

/** Cache expiration time for stream URLs (2 hours) */
export const CACHE_EXPIRATION_MS = 2 * 60 * 60 * 1000;

/** Maximum number of cached stream URLs before LRU eviction */
export const MAX_CACHE_SIZE = 500;

/** Timeout for fetch operations */
export const FETCH_TIMEOUT_MS = 10000;

export default {
  CACHE_EXPIRATION_MS,
  MAX_CACHE_SIZE,
  FETCH_TIMEOUT_MS,
};
