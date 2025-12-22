const { Pool } = require('pg');
const { createLogger } = require('./logger');
const { loadConfig } = require('./config');

const log = createLogger('DATABASE');

let pool = null;

/**
 * Initialize PostgreSQL connection pool
 */
function initDatabase() {
    const config = loadConfig();
    
    if (!config.databaseUrl) {
        log.warn('DATABASE_URL not configured. Statistics tracking will be disabled.');
        return null;
    }

    try {
        pool = new Pool({
            connectionString: config.databaseUrl,
            max: 10, // Maximum number of clients in the pool
            idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
            connectionTimeoutMillis: 5000, // Return an error after 5 seconds if connection could not be established
        });

        // Handle pool errors
        pool.on('error', (err) => {
            log.error(`Unexpected error on idle database client: ${err.message}`);
        });

        // Test connection
        pool.query('SELECT NOW()', (err) => {
            if (err) {
                log.error(`Database connection test failed: ${err.message}`);
                pool = null;
            } else {
                log.info('✓ Database connection pool initialized');
            }
        });

        return pool;
    } catch (error) {
        log.error(`Failed to initialize database pool: ${error.message}`);
        return null;
    }
}

/**
 * Get the database pool (returns null if not initialized)
 */
function getPool() {
    return pool;
}

/**
 * Execute a query safely (handles errors gracefully)
 */
async function query(text, params) {
    if (!pool) {
        log.debug('Database pool not available, skipping query');
        return null;
    }

    try {
        const result = await pool.query(text, params);
        return result;
    } catch (error) {
        log.error(`Database query error: ${error.message}`, { query: text.substring(0, 100) });
        return null;
    }
}

/**
 * Close the database pool
 */
async function close() {
    if (pool) {
        await pool.end();
        pool = null;
        log.info('Database pool closed');
    }
}

module.exports = {
    initDatabase,
    getPool,
    query,
    close,
};

