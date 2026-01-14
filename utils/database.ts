// util-category: db
import { Pool, PoolConfig, QueryResult } from 'pg';
import { createLogger } from './logger';
import { loadConfig } from './config';

const log = createLogger('DATABASE');

let pool: Pool | null = null;
let schemaInitialized = false;

/**
 * Initialize PostgreSQL connection pool
 */
export function initDatabase(): Pool | null {
  const config = loadConfig();

  if (!config.databaseUrl) {
    log.warn('DATABASE_URL not configured. Statistics tracking will be disabled.');
    return null;
  }

  try {
    // Parse connection string to handle SSL requirements (common in Railway/cloud providers)
    const poolConfig: PoolConfig = {
      connectionString: config.databaseUrl,
      max: 10, // Maximum number of clients in the pool
      idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
      connectionTimeoutMillis: 10000, // Return an error after 10 seconds if connection could not be established
    };

    // For production databases (Railway, Heroku, etc.), SSL is usually required
    // Parse URL to check if it's a cloud provider
    if (
      config.databaseUrl &&
      (config.databaseUrl.includes('railway.app') ||
        config.databaseUrl.includes('herokuapp.com') ||
        config.databaseUrl.includes('amazonaws.com'))
    ) {
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
    pool
      .query('SELECT NOW()')
      .then(async () => {
        log.info('✓ Database connection pool initialized');
        // Automatically setup schema if not already initialized
        // Call initializeSchema directly without setTimeout to ensure it completes ASAP
        await initializeSchema();
      })
      .catch((err) => {
        log.error(`Database connection test failed: ${err.message}`);
        pool = null;
      });

    return pool;
  } catch (error) {
    const err = error as Error;
    log.error(`Failed to initialize database pool: ${err.message}`);
    return null;
  }
}

/**
 * Get the database pool (returns null if not initialized)
 */
export function getPool(): Pool | null {
  return pool;
}

/**
 * Check if database schema is initialized
 */
export function isSchemaInitialized(): boolean {
  return schemaInitialized;
}

/**
 * Wait for schema to be initialized (with timeout)
 * @param timeoutMs Maximum time to wait in milliseconds (default: 30000)
 * @returns true if schema initialized, false if timeout
 */
export async function waitForSchema(timeoutMs: number = 30000): Promise<boolean> {
  if (schemaInitialized) return true;
  if (!pool) return false;

  const startTime = Date.now();
  // Poll every 500ms to reduce CPU overhead while maintaining reasonable responsiveness
  while (!schemaInitialized && Date.now() - startTime < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  return schemaInitialized;
}

/**
 * Execute a query safely (handles errors gracefully)
 */
export async function query(text: string, params?: unknown[]): Promise<QueryResult | null> {
  if (!pool) {
    log.debug('Database pool not available, skipping query');
    return null;
  }

  try {
    const result = await pool.query(text, params);
    return result;
  } catch (error) {
    const err = error as Error;
    log.error(`Database query error: ${err.message}`, { query: text.substring(0, 100) });
    return null;
  }
}

/**
 * Initialize database schema (tables, indexes, views)
 * This runs automatically on first connection
 * Can also be called manually to ensure schema is set up
 */
export async function initializeSchema(): Promise<boolean> {
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
            CREATE TABLE IF NOT EXISTS user_profiles (
                user_id VARCHAR(20) PRIMARY KEY,
                username VARCHAR(100),
                discriminator VARCHAR(10),
                updated_at TIMESTAMP NOT NULL DEFAULT NOW()
            )
        `);

    log.debug('Creating guild_queue_snapshots table...');
    await pool.query(`
            CREATE TABLE IF NOT EXISTS guild_queue_snapshots (
                guild_id VARCHAR(20) PRIMARY KEY,
                channel_id VARCHAR(20) NOT NULL,
                queue_data JSONB NOT NULL,
                current_track JSONB,
                position_ms BIGINT DEFAULT 0,
                is_paused BOOLEAN DEFAULT FALSE,
                volume INTEGER DEFAULT 100,
                last_user_id VARCHAR(20),
                saved_at TIMESTAMP DEFAULT NOW()
            )
        `);
    log.debug('✓ guild_queue_snapshots table created/verified');

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

    // ============================================================================
    // NEW STATS IMPROVEMENTS - Migration for enhanced analytics
    // ============================================================================

    // Add execution_time_ms to command_stats for performance tracking
    await pool.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_name = 'command_stats' AND column_name = 'execution_time_ms'
                ) THEN
                    ALTER TABLE command_stats ADD COLUMN execution_time_ms INTEGER;
                END IF;
            END $$;
        `);

    // Add error_type enum for error classification
    await pool.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_name = 'command_stats' AND column_name = 'error_type'
                ) THEN
                    ALTER TABLE command_stats ADD COLUMN error_type VARCHAR(20)
                    CHECK (error_type IN ('validation', 'permission', 'not_found', 'rate_limit', 'external_api', 'internal', 'timeout', NULL));
                END IF;
            END $$;
        `);

    // Add first_seen_at to user_profiles for retention analysis
    await pool.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_name = 'user_profiles' AND column_name = 'first_seen_at'
                ) THEN
                    ALTER TABLE user_profiles ADD COLUMN first_seen_at TIMESTAMP DEFAULT NOW();
                END IF;
            END $$;
        `);

    // Add skip tracking columns to sound_stats
    await pool.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_name = 'sound_stats' AND column_name = 'skipped_at_seconds'
                ) THEN
                    ALTER TABLE sound_stats ADD COLUMN skipped_at_seconds INTEGER;
                END IF;
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_name = 'sound_stats' AND column_name = 'completed'
                ) THEN
                    ALTER TABLE sound_stats ADD COLUMN completed BOOLEAN DEFAULT NULL;
                END IF;
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_name = 'sound_stats' AND column_name = 'listened_duration'
                ) THEN
                    ALTER TABLE sound_stats ADD COLUMN listened_duration INTEGER;
                END IF;
            END $$;
        `);

    // Create voice_sessions table for session duration tracking
    await pool.query(`
            CREATE TABLE IF NOT EXISTS voice_sessions (
                id SERIAL PRIMARY KEY,
                session_id VARCHAR(36) NOT NULL UNIQUE,
                guild_id VARCHAR(20) NOT NULL,
                channel_id VARCHAR(20) NOT NULL,
                channel_name VARCHAR(255),
                started_at TIMESTAMP NOT NULL DEFAULT NOW(),
                ended_at TIMESTAMP,
                duration_seconds INTEGER,
                tracks_played INTEGER DEFAULT 0,
                user_count_peak INTEGER DEFAULT 1,
                source VARCHAR(10) NOT NULL CHECK (source IN ('discord', 'api'))
            )
        `);

    // Create search_stats table for discovery tracking
    await pool.query(`
            CREATE TABLE IF NOT EXISTS search_stats (
                id SERIAL PRIMARY KEY,
                user_id VARCHAR(20) NOT NULL,
                guild_id VARCHAR(20) NOT NULL,
                query TEXT NOT NULL,
                query_type VARCHAR(20) NOT NULL CHECK (query_type IN ('search', 'url', 'playlist', 'soundboard')),
                results_count INTEGER,
                selected_index INTEGER,
                selected_title VARCHAR(500),
                searched_at TIMESTAMP NOT NULL DEFAULT NOW(),
                source VARCHAR(10) NOT NULL CHECK (source IN ('discord', 'api'))
            )
        `);

    // Create user_voice_sessions table for tracking individual user listening sessions
    await pool.query(`
            CREATE TABLE IF NOT EXISTS user_voice_sessions (
                id SERIAL PRIMARY KEY,
                session_id VARCHAR(64) NOT NULL UNIQUE,
                bot_session_id VARCHAR(64),
                user_id VARCHAR(20) NOT NULL,
                username VARCHAR(100),
                discriminator VARCHAR(10),
                guild_id VARCHAR(20) NOT NULL,
                channel_id VARCHAR(20) NOT NULL,
                channel_name VARCHAR(255),
                joined_at TIMESTAMP NOT NULL DEFAULT NOW(),
                left_at TIMESTAMP,
                duration_seconds INTEGER,
                tracks_heard INTEGER DEFAULT 0
            )
        `);

    // Create user_track_listens table for tracking which tracks each user heard
    await pool.query(`
            CREATE TABLE IF NOT EXISTS user_track_listens (
                id SERIAL PRIMARY KEY,
                user_session_id VARCHAR(64) NOT NULL,
                user_id VARCHAR(20) NOT NULL,
                guild_id VARCHAR(20) NOT NULL,
                track_title VARCHAR(500) NOT NULL,
                track_url TEXT,
                source_type VARCHAR(20) NOT NULL CHECK (source_type IN ('local', 'youtube', 'spotify', 'soundcloud', 'other')),
                duration INTEGER,
                listened_at TIMESTAMP NOT NULL DEFAULT NOW(),
                queued_by VARCHAR(20)
            )
        `);

    // Create track_engagement table for tracking completion vs skip patterns
    await pool.query(`
            CREATE TABLE IF NOT EXISTS track_engagement (
                id SERIAL PRIMARY KEY,
                engagement_id VARCHAR(64) NOT NULL UNIQUE,
                track_title VARCHAR(500) NOT NULL,
                track_url TEXT,
                guild_id VARCHAR(20) NOT NULL,
                channel_id VARCHAR(20) NOT NULL,
                source_type VARCHAR(20) NOT NULL CHECK (source_type IN ('local', 'youtube', 'spotify', 'soundcloud', 'other')),
                started_at TIMESTAMP NOT NULL DEFAULT NOW(),
                ended_at TIMESTAMP,
                duration_seconds INTEGER,
                played_seconds INTEGER,
                was_skipped BOOLEAN DEFAULT false,
                skipped_at_seconds INTEGER,
                was_completed BOOLEAN DEFAULT false,
                skip_reason VARCHAR(50) CHECK (skip_reason IN ('user_skip', 'queue_clear', 'bot_leave', 'error', 'next_track')),
                queued_by VARCHAR(20),
                skipped_by VARCHAR(20),
                listeners_at_start INTEGER DEFAULT 0,
                listeners_at_end INTEGER DEFAULT 0
            )
        `);

    // Create interaction_events table for tracking button vs command usage
    await pool.query(`
            CREATE TABLE IF NOT EXISTS interaction_events (
                id SERIAL PRIMARY KEY,
                interaction_type VARCHAR(30) NOT NULL CHECK (interaction_type IN ('button', 'slash_command', 'autocomplete', 'context_menu', 'modal')),
                interaction_id VARCHAR(50),
                custom_id VARCHAR(100),
                user_id VARCHAR(20) NOT NULL,
                username VARCHAR(100),
                guild_id VARCHAR(20) NOT NULL,
                channel_id VARCHAR(20),
                response_time_ms INTEGER,
                success BOOLEAN DEFAULT true,
                error_message TEXT,
                metadata JSONB,
                created_at TIMESTAMP NOT NULL DEFAULT NOW()
            )
        `);

    // Create playback_state_changes table for tracking volume, pause, seek, etc.
    await pool.query(`
            CREATE TABLE IF NOT EXISTS playback_state_changes (
                id SERIAL PRIMARY KEY,
                guild_id VARCHAR(20) NOT NULL,
                channel_id VARCHAR(20),
                state_type VARCHAR(30) NOT NULL CHECK (state_type IN ('volume', 'pause', 'resume', 'seek', 'loop_toggle', 'shuffle')),
                old_value VARCHAR(50),
                new_value VARCHAR(50),
                user_id VARCHAR(20),
                username VARCHAR(100),
                track_title VARCHAR(500),
                track_position_seconds INTEGER,
                source VARCHAR(10) NOT NULL CHECK (source IN ('discord', 'api')),
                created_at TIMESTAMP NOT NULL DEFAULT NOW()
            )
        `);

    // Create web_sessions table for tracking dashboard usage
    await pool.query(`
            CREATE TABLE IF NOT EXISTS web_sessions (
                id SERIAL PRIMARY KEY,
                session_id VARCHAR(64) NOT NULL UNIQUE,
                user_id VARCHAR(20) NOT NULL,
                username VARCHAR(100),
                ip_address VARCHAR(45),
                user_agent TEXT,
                started_at TIMESTAMP NOT NULL DEFAULT NOW(),
                last_activity_at TIMESTAMP,
                ended_at TIMESTAMP,
                page_views INTEGER DEFAULT 0,
                actions_taken INTEGER DEFAULT 0
            )
        `);

    // Create web_events table for tracking every dashboard action
    await pool.query(`
            CREATE TABLE IF NOT EXISTS web_events (
                id SERIAL PRIMARY KEY,
                web_session_id VARCHAR(64),
                user_id VARCHAR(20) NOT NULL,
                event_type VARCHAR(50) NOT NULL,
                event_target VARCHAR(100),
                event_value TEXT,
                guild_id VARCHAR(20),
                duration_ms INTEGER,
                created_at TIMESTAMP NOT NULL DEFAULT NOW()
            )
        `);

    // Create guild_events table for tracking bot join/leave and member events
    await pool.query(`
            CREATE TABLE IF NOT EXISTS guild_events (
                id SERIAL PRIMARY KEY,
                event_type VARCHAR(30) NOT NULL CHECK (event_type IN ('bot_added', 'bot_removed', 'member_joined', 'member_left', 'guild_updated')),
                guild_id VARCHAR(20) NOT NULL,
                guild_name VARCHAR(100),
                member_count INTEGER,
                user_id VARCHAR(20),
                metadata JSONB,
                created_at TIMESTAMP NOT NULL DEFAULT NOW()
            )
        `);

    // Create error_details table for comprehensive error tracking
    await pool.query(`
            CREATE TABLE IF NOT EXISTS error_details (
                id SERIAL PRIMARY KEY,
                error_hash VARCHAR(64) NOT NULL,
                error_type VARCHAR(50) NOT NULL,
                error_message TEXT,
                error_stack TEXT,
                command_name VARCHAR(50),
                user_id VARCHAR(20),
                guild_id VARCHAR(20),
                context JSONB,
                occurrence_count INTEGER DEFAULT 1,
                first_seen_at TIMESTAMP NOT NULL DEFAULT NOW(),
                last_seen_at TIMESTAMP NOT NULL DEFAULT NOW()
            )
        `);

    // Create api_latency table for performance monitoring
    await pool.query(`
            CREATE TABLE IF NOT EXISTS api_latency (
                id SERIAL PRIMARY KEY,
                endpoint VARCHAR(100) NOT NULL,
                method VARCHAR(10) NOT NULL,
                response_time_ms INTEGER NOT NULL,
                status_code INTEGER,
                user_id VARCHAR(20),
                request_size_bytes INTEGER,
                response_size_bytes INTEGER,
                created_at TIMESTAMP NOT NULL DEFAULT NOW()
            )
        `);

    // Create user_scores table for behavioral analytics
    await pool.query(`
            CREATE TABLE IF NOT EXISTS user_scores (
                id SERIAL PRIMARY KEY,
                user_id VARCHAR(20) NOT NULL,
                guild_id VARCHAR(20) NOT NULL,
                engagement_score DECIMAL(5,2),
                completion_rate DECIMAL(5,2),
                skip_rate DECIMAL(5,2),
                discovery_score DECIMAL(5,2),
                social_score DECIMAL(5,2),
                soundboard_affinity DECIMAL(5,2),
                peak_activity_hour INTEGER,
                avg_session_minutes DECIMAL(8,2),
                total_listening_hours DECIMAL(10,2),
                last_calculated_at TIMESTAMP NOT NULL DEFAULT NOW(),
                UNIQUE(user_id, guild_id)
            )
        `);

    // Create indexes
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_command_stats_guild_id ON command_stats(guild_id)`
    );
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_command_stats_user_id ON command_stats(user_id)`
    );
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_command_stats_executed_at ON command_stats(executed_at)`
    );
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_command_stats_command_name ON command_stats(command_name)`
    );

    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_sound_stats_guild_id ON sound_stats(guild_id)`
    );
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_sound_stats_user_id ON sound_stats(user_id)`);
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_sound_stats_played_at ON sound_stats(played_at)`
    );
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_sound_stats_sound_name ON sound_stats(sound_name)`
    );

    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_queue_ops_guild_id ON queue_operations(guild_id)`
    );
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_queue_ops_user_id ON queue_operations(user_id)`
    );
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_queue_ops_executed_at ON queue_operations(executed_at)`
    );

    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_voice_events_guild_id ON voice_events(guild_id)`
    );
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_voice_events_executed_at ON voice_events(executed_at)`
    );

    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_user_profiles_username ON user_profiles(username)`
    );

    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_listening_history_user_id ON listening_history(user_id)`
    );
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_listening_history_guild_id ON listening_history(guild_id)`
    );
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_listening_history_played_at ON listening_history(played_at)`
    );
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_listening_history_user_guild ON listening_history(user_id, guild_id)`
    );
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_listening_history_queued_by ON listening_history(queued_by)`
    );

    // New composite indexes for better query performance
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_command_stats_guild_date ON command_stats(guild_id, executed_at)`
    );
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_command_stats_user_date ON command_stats(user_id, executed_at)`
    );
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_sound_stats_guild_date ON sound_stats(guild_id, played_at)`
    );
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_sound_stats_user_guild_date ON sound_stats(user_id, guild_id, played_at)`
    );
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_listening_history_guild_date ON listening_history(guild_id, played_at DESC)`
    );

    // Indexes for new tables
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_voice_sessions_guild_id ON voice_sessions(guild_id)`
    );
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_voice_sessions_started_at ON voice_sessions(started_at)`
    );
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_voice_sessions_guild_started ON voice_sessions(guild_id, started_at)`
    );
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_search_stats_user_id ON search_stats(user_id)`
    );
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_search_stats_guild_id ON search_stats(guild_id)`
    );
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_search_stats_searched_at ON search_stats(searched_at)`
    );

    // Indexes for user_voice_sessions
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_user_voice_sessions_user_id ON user_voice_sessions(user_id)`
    );
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_user_voice_sessions_guild_id ON user_voice_sessions(guild_id)`
    );
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_user_voice_sessions_joined_at ON user_voice_sessions(joined_at)`
    );
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_user_voice_sessions_bot_session ON user_voice_sessions(bot_session_id)`
    );
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_user_voice_sessions_user_guild ON user_voice_sessions(user_id, guild_id)`
    );
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_user_voice_sessions_guild_joined ON user_voice_sessions(guild_id, joined_at DESC)`
    );

    // Indexes for user_track_listens
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_user_track_listens_user_id ON user_track_listens(user_id)`
    );
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_user_track_listens_user_session ON user_track_listens(user_session_id)`
    );
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_user_track_listens_listened_at ON user_track_listens(listened_at)`
    );
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_user_track_listens_guild_id ON user_track_listens(guild_id)`
    );
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_user_track_listens_track_title ON user_track_listens(track_title)`
    );

    // Indexes for track_engagement
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_track_engagement_guild_id ON track_engagement(guild_id)`
    );
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_track_engagement_started_at ON track_engagement(started_at)`
    );
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_track_engagement_was_skipped ON track_engagement(was_skipped)`
    );
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_track_engagement_was_completed ON track_engagement(was_completed)`
    );
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_track_engagement_guild_date ON track_engagement(guild_id, started_at DESC)`
    );

    // Indexes for interaction_events
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_interaction_events_user_id ON interaction_events(user_id)`
    );
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_interaction_events_guild_id ON interaction_events(guild_id)`
    );
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_interaction_events_type ON interaction_events(interaction_type)`
    );
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_interaction_events_created_at ON interaction_events(created_at)`
    );
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_interaction_events_custom_id ON interaction_events(custom_id)`
    );

    // Indexes for playback_state_changes
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_playback_state_guild_id ON playback_state_changes(guild_id)`
    );
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_playback_state_type ON playback_state_changes(state_type)`
    );
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_playback_state_user_id ON playback_state_changes(user_id)`
    );
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_playback_state_created_at ON playback_state_changes(created_at)`
    );

    // Indexes for web_sessions
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_web_sessions_user_id ON web_sessions(user_id)`
    );
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_web_sessions_started_at ON web_sessions(started_at)`
    );

    // Indexes for web_events
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_web_events_user_id ON web_events(user_id)`);
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_web_events_session_id ON web_events(web_session_id)`
    );
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_web_events_event_type ON web_events(event_type)`
    );
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_web_events_created_at ON web_events(created_at)`
    );

    // Indexes for guild_events
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_guild_events_guild_id ON guild_events(guild_id)`
    );
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_guild_events_event_type ON guild_events(event_type)`
    );
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_guild_events_created_at ON guild_events(created_at)`
    );

    // Indexes for error_details
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_error_details_error_hash ON error_details(error_hash)`
    );
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_error_details_error_type ON error_details(error_type)`
    );
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_error_details_last_seen ON error_details(last_seen_at)`
    );

    // Indexes for api_latency
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_api_latency_endpoint ON api_latency(endpoint)`
    );
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_api_latency_created_at ON api_latency(created_at)`
    );
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_api_latency_user_id ON api_latency(user_id)`);

    // Indexes for user_scores
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_user_scores_user_id ON user_scores(user_id)`);
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_user_scores_guild_id ON user_scores(guild_id)`
    );
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_user_scores_engagement ON user_scores(engagement_score DESC)`
    );

    // Create views - drop and recreate in transaction to allow column changes
    // Using transaction to minimize window where view doesn't exist
    await pool.query(`
            DO $$
            BEGIN
                DROP VIEW IF EXISTS user_stats_view;
                CREATE VIEW user_stats_view AS
            SELECT
                COALESCE(c.user_id, s.user_id) AS user_id,
                COALESCE(c.guild_id, s.guild_id) AS guild_id,
                COALESCE(MAX(u.username), MAX(c.username), MAX(s.username)) AS username,
                COALESCE(MAX(u.discriminator), MAX(c.discriminator), MAX(s.discriminator)) AS discriminator,
                COUNT(DISTINCT c.id) AS command_count,
                COUNT(DISTINCT s.id) AS sound_count,
                GREATEST(MAX(c.executed_at), MAX(s.played_at)) AS last_active
            FROM command_stats c
            FULL OUTER JOIN sound_stats s ON c.user_id = s.user_id AND c.guild_id = s.guild_id
            LEFT JOIN user_profiles u ON u.user_id = COALESCE(c.user_id, s.user_id)
            GROUP BY COALESCE(c.user_id, s.user_id), COALESCE(c.guild_id, s.guild_id);
            END $$;
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

    // User listening stats view for aggregated user session analytics
    await pool.query(`
            CREATE OR REPLACE VIEW user_listening_stats_view AS
            SELECT
                uvs.user_id,
                uvs.guild_id,
                COALESCE(up.username, MAX(uvs.username)) AS username,
                COALESCE(up.discriminator, MAX(uvs.discriminator)) AS discriminator,
                COUNT(DISTINCT uvs.session_id) AS total_sessions,
                SUM(uvs.duration_seconds) AS total_listening_seconds,
                SUM(uvs.tracks_heard) AS total_tracks_heard,
                ROUND(AVG(uvs.duration_seconds), 0) AS avg_session_duration,
                MAX(uvs.joined_at) AS last_session_at,
                MIN(uvs.joined_at) AS first_session_at
            FROM user_voice_sessions uvs
            LEFT JOIN user_profiles up ON uvs.user_id = up.user_id
            WHERE uvs.left_at IS NOT NULL
            GROUP BY uvs.user_id, uvs.guild_id, up.username, up.discriminator
        `);

    schemaInitialized = true;
    log.info('✓ Database schema initialized');
    return true;
  } catch (error) {
    const err = error as Error;
    log.error(`Failed to initialize database schema: ${err.message}`, { stack: err.stack });
    // Don't throw - allow app to continue without schema
    return false;
  }
}

/**
 * Close the database pool
 */
export async function close(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    schemaInitialized = false;
    log.info('Database pool closed');
  }
}
