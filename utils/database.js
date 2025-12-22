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
        // Parse connection string to handle SSL requirements (common in Railway/cloud providers)
        const poolConfig = {
            connectionString: config.databaseUrl,
            max: 10, // Maximum number of clients in the pool
            idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
            connectionTimeoutMillis: 10000, // Return an error after 10 seconds if connection could not be established
        };

        // For production databases (Railway, Heroku, etc.), SSL is usually required
        // Parse URL to check if it's a cloud provider
        if (config.databaseUrl && (config.databaseUrl.includes('railway.app') || 
                                   config.databaseUrl.includes('herokuapp.com') ||
                                   config.databaseUrl.includes('amazonaws.com'))) {
            poolConfig.ssl = {
                rejectUnauthorized: false, // Required for Railway/Heroku PostgreSQL
            };
        }

        pool = new Pool(poolConfig);

        // Handle pool errors
        pool.on('error', (err) => {
            log.error(`Unexpected error on idle database client: ${err.message}`);
        });

        // Test connection asynchronously
        pool.query('SELECT NOW()')
            .then(() => {
                log.info('✓ Database connection pool initialized');
            })
            .catch((err) => {
                log.error(`Database connection test failed: ${err.message}`);
                pool = null;
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

