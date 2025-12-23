const { Events } = require('discord.js');
const { createLogger } = require('../utils/logger');
const { deployCommands } = require('../utils/deployCommands');
const { loadConfig } = require('../utils/config');

const log = createLogger('BOT');

module.exports = {
    name: Events.ClientReady,
    once: true,
    async execute(client) {
        log.info(`Logged in as ${client.user.tag}`);

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
