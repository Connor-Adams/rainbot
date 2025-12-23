/**
 * Voice manager constants
 */

module.exports = {
    /** Cache expiration time for stream URLs (2 hours) */
    CACHE_EXPIRATION_MS: 2 * 60 * 60 * 1000,

    /** Maximum number of cached stream URLs before LRU eviction */
    MAX_CACHE_SIZE: 500,

    /** Timeout for fetch operations */
    FETCH_TIMEOUT_MS: 10000,
};
