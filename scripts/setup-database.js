const { Pool } = require('pg');
const { loadConfig } = require('../utils/config');
const { createLogger } = require('../utils/logger');

const log = createLogger('DB_SETUP');

/**
 * Initialize database schema (tables, views, indexes)
 */
async function setupDatabase() {
    const config = loadConfig();
    
    if (!config.databaseUrl) {
        log.error('DATABASE_URL not configured. Cannot setup database.');
        process.exit(1);
    }

    const pool = new Pool({
        connectionString: config.databaseUrl,
    });

    try {
        log.info('Setting up database schema...');

        // Create tables
        await pool.query(`
            CREATE TABLE IF NOT EXISTS command_stats (
                id SERIAL PRIMARY KEY,
                command_name VARCHAR(100) NOT NULL,
                user_id VARCHAR(20) NOT NULL,
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
                metadata JSONB
            )
        `);

        log.info('✓ Tables created');

        // Create indexes
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_command_stats_guild_id ON command_stats(guild_id)
        `);
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_command_stats_user_id ON command_stats(user_id)
        `);
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_command_stats_executed_at ON command_stats(executed_at)
        `);
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_command_stats_command_name ON command_stats(command_name)
        `);

        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_sound_stats_guild_id ON sound_stats(guild_id)
        `);
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_sound_stats_user_id ON sound_stats(user_id)
        `);
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_sound_stats_played_at ON sound_stats(played_at)
        `);
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_sound_stats_sound_name ON sound_stats(sound_name)
        `);

        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_queue_ops_guild_id ON queue_operations(guild_id)
        `);
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_queue_ops_user_id ON queue_operations(user_id)
        `);
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_queue_ops_executed_at ON queue_operations(executed_at)
        `);

        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_voice_events_guild_id ON voice_events(guild_id)
        `);
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_voice_events_executed_at ON voice_events(executed_at)
        `);

        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_listening_history_user_id ON listening_history(user_id)
        `);
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_listening_history_guild_id ON listening_history(guild_id)
        `);
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_listening_history_played_at ON listening_history(played_at)
        `);
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_listening_history_user_guild ON listening_history(user_id, guild_id)
        `);

        log.info('✓ Indexes created');

        // Create views
        await pool.query(`
            CREATE OR REPLACE VIEW user_stats_view AS
            SELECT 
                COALESCE(c.user_id, s.user_id) AS user_id,
                COALESCE(c.guild_id, s.guild_id) AS guild_id,
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

        log.info('✓ Views created');

        log.info('✓ Database schema setup complete');
    } catch (error) {
        log.error(`Database setup failed: ${error.message}`);
        throw error;
    } finally {
        await pool.end();
    }
}

// Run if called directly
if (require.main === module) {
    setupDatabase()
        .then(() => {
            log.info('Database setup completed successfully');
            process.exit(0);
        })
        .catch((error) => {
            log.error(`Database setup failed: ${error.message}`);
            process.exit(1);
        });
}

module.exports = {
    setupDatabase,
};

