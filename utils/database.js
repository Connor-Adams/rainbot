const { Pool } = require('pg');
const { createLogger } = require('./logger');
const { loadConfig } = require('./config');

const log = createLogger('DATABASE');

let pool = null;
let schemaInitialized = false;

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

        // Test connection and initialize schema asynchronously
        pool.query('SELECT NOW()')
            .then(async () => {
                log.info('✓ Database connection pool initialized');
                // Automatically setup schema if not already initialized
                // Wait a bit to ensure connection is fully ready
                setTimeout(async () => {
                    await initializeSchema();
                }, 1000);
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
 * Initialize database schema (tables, indexes, views)
 * This runs automatically on first connection
 * Can also be called manually to ensure schema is set up
 */
async function initializeSchema() {
    if (!pool) {
        log.warn('Cannot initialize schema: database pool not available');
        return false;
    }

    if (schemaInitialized) {
        log.debug('Schema already initialized, skipping');
        return true;
    }

    try {
        log.info('Initializing database schema...');

        // Create tables
        await pool.query(`
            CREATE TABLE IF NOT EXISTS command_stats (
                id SERIAL PRIMARY KEY,
                command_name VARCHAR(100) NOT NULL,
                user_id VARCHAR(20) NOT NULL,
                username VARCHAR(100),
                discriminator VARCHAR(10),
                guild_id VARCHAR(20) NOT NULL,
                source VARCHAR(10) NOT NULL CHECK (source IN ('discord', 'api')),
                executed_at TIMESTAMP NOT NULL DEFAULT NOW(),
                success BOOLEAN NOT NULL DEFAULT TRUE,
                error_message TEXT
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS sound_stats (
                id SERIAL PRIMARY KEY,
                sound_name VARCHAR(255) NOT NULL,
                user_id VARCHAR(20) NOT NULL,
                username VARCHAR(100),
                discriminator VARCHAR(10),
                guild_id VARCHAR(20) NOT NULL,
                source_type VARCHAR(20) NOT NULL CHECK (source_type IN ('local', 'youtube', 'spotify', 'soundcloud', 'other')),
                is_soundboard BOOLEAN NOT NULL DEFAULT FALSE,
                played_at TIMESTAMP NOT NULL DEFAULT NOW(),
                duration INTEGER,
                source VARCHAR(10) NOT NULL CHECK (source IN ('discord', 'api'))
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS queue_operations (
                id SERIAL PRIMARY KEY,
                operation_type VARCHAR(20) NOT NULL CHECK (operation_type IN ('skip', 'pause', 'resume', 'clear', 'remove')),
                user_id VARCHAR(20) NOT NULL,
                guild_id VARCHAR(20) NOT NULL,
                executed_at TIMESTAMP NOT NULL DEFAULT NOW(),
                source VARCHAR(10) NOT NULL CHECK (source IN ('discord', 'api')),
                metadata JSONB
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS voice_events (
                id SERIAL PRIMARY KEY,
                event_type VARCHAR(10) NOT NULL CHECK (event_type IN ('join', 'leave')),
                guild_id VARCHAR(20) NOT NULL,
                channel_id VARCHAR(20) NOT NULL,
                channel_name VARCHAR(255),
                executed_at TIMESTAMP NOT NULL DEFAULT NOW(),
                source VARCHAR(10) NOT NULL CHECK (source IN ('discord', 'api'))
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS listening_history (
                id SERIAL PRIMARY KEY,
                user_id VARCHAR(20) NOT NULL,
                guild_id VARCHAR(20) NOT NULL,
                track_title VARCHAR(500) NOT NULL,
                track_url TEXT,
                source_type VARCHAR(20) NOT NULL CHECK (source_type IN ('local', 'youtube', 'spotify', 'soundcloud', 'other')),
                is_soundboard BOOLEAN NOT NULL DEFAULT FALSE,
                duration INTEGER,
                played_at TIMESTAMP NOT NULL DEFAULT NOW(),
                source VARCHAR(10) NOT NULL CHECK (source IN ('discord', 'api')),
                queued_by VARCHAR(20),
                metadata JSONB
            )
        `);

        // Add queued_by column if it doesn't exist (migration for existing databases)
        await pool.query(`
            DO $$ 
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_name = 'listening_history' AND column_name = 'queued_by'
                ) THEN
                    ALTER TABLE listening_history ADD COLUMN queued_by VARCHAR(20);
                END IF;
            END $$;
        `);

        // Add username/discriminator columns if they don't exist (migration)
        await pool.query(`
            DO $$ 
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_name = 'command_stats' AND column_name = 'username'
                ) THEN
                    ALTER TABLE command_stats ADD COLUMN username VARCHAR(100);
                END IF;
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_name = 'command_stats' AND column_name = 'discriminator'
                ) THEN
                    ALTER TABLE command_stats ADD COLUMN discriminator VARCHAR(10);
                END IF;
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_name = 'sound_stats' AND column_name = 'username'
                ) THEN
                    ALTER TABLE sound_stats ADD COLUMN username VARCHAR(100);
                END IF;
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_name = 'sound_stats' AND column_name = 'discriminator'
                ) THEN
                    ALTER TABLE sound_stats ADD COLUMN discriminator VARCHAR(10);
                END IF;
            END $$;
        `);

        // Create indexes
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_command_stats_guild_id ON command_stats(guild_id)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_command_stats_user_id ON command_stats(user_id)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_command_stats_executed_at ON command_stats(executed_at)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_command_stats_command_name ON command_stats(command_name)`);

        await pool.query(`CREATE INDEX IF NOT EXISTS idx_sound_stats_guild_id ON sound_stats(guild_id)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_sound_stats_user_id ON sound_stats(user_id)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_sound_stats_played_at ON sound_stats(played_at)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_sound_stats_sound_name ON sound_stats(sound_name)`);

        await pool.query(`CREATE INDEX IF NOT EXISTS idx_queue_ops_guild_id ON queue_operations(guild_id)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_queue_ops_user_id ON queue_operations(user_id)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_queue_ops_executed_at ON queue_operations(executed_at)`);

        await pool.query(`CREATE INDEX IF NOT EXISTS idx_voice_events_guild_id ON voice_events(guild_id)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_voice_events_executed_at ON voice_events(executed_at)`);

        await pool.query(`CREATE INDEX IF NOT EXISTS idx_listening_history_user_id ON listening_history(user_id)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_listening_history_guild_id ON listening_history(guild_id)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_listening_history_played_at ON listening_history(played_at)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_listening_history_user_guild ON listening_history(user_id, guild_id)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_listening_history_queued_by ON listening_history(queued_by)`);

        // Create views
        await pool.query(`
            CREATE OR REPLACE VIEW user_stats_view AS
            SELECT 
                COALESCE(c.user_id, s.user_id) AS user_id,
                COALESCE(c.guild_id, s.guild_id) AS guild_id,
                COALESCE(MAX(c.username), MAX(s.username)) AS username,
                COALESCE(MAX(c.discriminator), MAX(s.discriminator)) AS discriminator,
                COUNT(DISTINCT c.id) AS command_count,
                COUNT(DISTINCT s.id) AS sound_count,
                GREATEST(MAX(c.executed_at), MAX(s.played_at)) AS last_active
            FROM command_stats c
            FULL OUTER JOIN sound_stats s ON c.user_id = s.user_id AND c.guild_id = s.guild_id
            GROUP BY COALESCE(c.user_id, s.user_id), COALESCE(c.guild_id, s.guild_id)
        `);

        await pool.query(`
            CREATE OR REPLACE VIEW guild_stats_view AS
            SELECT 
                COALESCE(c.guild_id, s.guild_id) AS guild_id,
                COUNT(DISTINCT c.id) AS command_count,
                COUNT(DISTINCT s.id) AS sound_count,
                COUNT(DISTINCT COALESCE(c.user_id, s.user_id)) AS unique_users,
                GREATEST(MAX(c.executed_at), MAX(s.played_at)) AS last_active
            FROM command_stats c
            FULL OUTER JOIN sound_stats s ON c.guild_id = s.guild_id
            GROUP BY COALESCE(c.guild_id, s.guild_id)
        `);

        await pool.query(`
            CREATE OR REPLACE VIEW daily_stats_view AS
            SELECT 
                COALESCE(c.date, s.date) AS date,
                COALESCE(c.command_count, 0) AS command_count,
                COALESCE(s.sound_count, 0) AS sound_count,
                COALESCE(c.unique_users, 0) + COALESCE(s.unique_users, 0) AS unique_users,
                GREATEST(COALESCE(c.unique_guilds, 0), COALESCE(s.unique_guilds, 0)) AS unique_guilds
            FROM (
                SELECT 
                    DATE(executed_at) AS date,
                    COUNT(*) AS command_count,
                    COUNT(DISTINCT user_id) AS unique_users,
                    COUNT(DISTINCT guild_id) AS unique_guilds
                FROM command_stats
                GROUP BY DATE(executed_at)
            ) c
            FULL OUTER JOIN (
                SELECT 
                    DATE(played_at) AS date,
                    COUNT(*) AS sound_count,
                    COUNT(DISTINCT user_id) AS unique_users,
                    COUNT(DISTINCT guild_id) AS unique_guilds
                FROM sound_stats
                GROUP BY DATE(played_at)
            ) s ON c.date = s.date
        `);

        schemaInitialized = true;
        log.info('✓ Database schema initialized');
        return true;
    } catch (error) {
        log.error(`Failed to initialize database schema: ${error.message}`, { stack: error.stack });
        // Don't throw - allow app to continue without schema
        return false;
    }
}

/**
 * Close the database pool
 */
async function close() {
    if (pool) {
        await pool.end();
        pool = null;
        schemaInitialized = false;
        log.info('Database pool closed');
    }
}

module.exports = {
    initDatabase,
    getPool,
    query,
    close,
    initializeSchema,
};
