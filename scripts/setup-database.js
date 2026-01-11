import process from 'node:process';
const { loadConfig } = require('../utils/config');
const { createLogger } = require('../utils/logger');
const { initDatabase, initializeSchema, close } = require('../utils/database');

const log = createLogger('DB_SETUP');

/**
 * Initialize database schema (tables, views, indexes)
 * Uses the shared database module for consistency
 */
async function setupDatabase() {
  const config = loadConfig();

  if (!config.databaseUrl) {
    log.error('DATABASE_URL not configured. Cannot setup database.');
    process.exit(1);
  }

  try {
    log.info('Initializing database connection...');

    // Initialize database pool
    const pool = initDatabase();
    if (!pool) {
      log.error('Failed to initialize database connection');
      process.exit(1);
    }

    // Wait a moment for connection to be ready
    await new Promise((resolve) => setTimeout(resolve, 2000));

    log.info('Setting up database schema...');

    // Use the shared schema initialization function
    const success = await initializeSchema();
    if (success) {
      log.info('✓ Database schema setup complete');
    } else {
      log.error('Database schema setup failed');
      await close();
      process.exit(1);
    }

    // Close connection (setup script should exit)
    await close();
  } catch (error) {
    log.error(`Database setup failed: ${error.message}`, { stack: error.stack });
    await close();
    throw error;
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
