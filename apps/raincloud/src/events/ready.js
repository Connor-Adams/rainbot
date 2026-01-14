const { Events } = require('discord.js');
const { createLogger } = require('../../dist/utils/logger');
const { deployCommands } = require('../../dist/utils/deployCommands');
const { loadConfig } = require('../../dist/utils/config');

const log = createLogger('BOT');

module.exports = {
  name: Events.ClientReady,
  once: true,
  async execute(client) {
    log.info(`Logged in as ${client.user.tag}`);

    // Restore saved queue snapshots from previous session (crash recovery)
    try {
      const { restoreAllQueueSnapshots, startAutoSave } = require('../../dist/utils/voiceManager');
      const { waitForSchema, getPool } = require('../../dist/utils/database');

      // Wait for database schema to be ready before restoring snapshots
      const pool = getPool();
      if (pool) {
        log.info('Waiting for database schema initialization...');
        const schemaReady = await waitForSchema(30000); // Wait up to 30 seconds
        if (!schemaReady) {
          log.warn('Database schema initialization timeout - snapshot restore may fail');
        } else {
          log.info('Database schema ready');
        }
      }

      // Start periodic auto-save (every 30s) for crash recovery
      startAutoSave();

      // Restore any queues that were active before shutdown/crash
      const restored = await restoreAllQueueSnapshots(client);
      if (restored > 0) {
        log.info(`Restored ${restored} queue snapshot(s) from previous session`);
      }
    } catch (error) {
      log.error(`Failed to restore queue snapshots: ${error.message}`);
    }

    const config = loadConfig();

    // Skip deployment if DISABLE_AUTO_DEPLOY is set (useful for local dev)
    if (config.disableAutoDeploy) {
      log.info('Auto-deploy disabled (DISABLE_AUTO_DEPLOY=true)');
      return;
    }

    log.info('Checking command deployment config...');
    log.debug(`Token present: ${!!config.token}`);
    log.debug(`Client ID: ${config.clientId || 'MISSING'}`);
    log.debug(`Guild ID: ${config.guildId || 'not set (will deploy globally)'}`);

    if (!config.token) {
      log.error('DISCORD_BOT_TOKEN is missing - cannot deploy commands');
      return;
    }

    if (!config.clientId) {
      log.error('DISCORD_CLIENT_ID is missing - cannot deploy commands');
      return;
    }

    // Deploy commands (use guildId if provided for faster updates, otherwise deploy globally)
    log.info('Starting command deployment...');
    try {
      await deployCommands(config.token, config.clientId, config.guildId || null);
      log.info('Command deployment completed successfully');
    } catch (error) {
      // Don't crash the bot if command deployment fails
      log.error(`Command deployment failed: ${error.message}`);
      log.error(error.stack);
    }
  },
};
