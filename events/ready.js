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

        if (!config.token || !config.clientId) {
            log.warn('Missing token or clientId, skipping command deployment');
            return;
        }

        // Deploy commands (use guildId if provided for faster updates, otherwise deploy globally)
        try {
            await deployCommands(config.token, config.clientId, config.guildId || null);
        } catch (error) {
            // Don't crash the bot if command deployment fails
            log.error('Command deployment failed, but bot will continue running');
        }
    },
};
