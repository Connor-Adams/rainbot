const { Events } = require('discord.js');
const { createLogger } = require('../utils/logger');
const { deployCommands } = require('../utils/deployCommands');

const log = createLogger('BOT');

module.exports = {
    name: Events.ClientReady,
    once: true,
    async execute(client) {
        log.info(`Logged in as ${client.user.tag}`);

        // Auto-deploy commands on startup
        // Use environment variables, fallback to config.json
        let config;
        try {
            config = require('../config.json');
        } catch (e) {
            config = {};
        }

        const token = process.env.DISCORD_BOT_TOKEN || config.token;
        const clientId = process.env.DISCORD_CLIENT_ID || config.clientId;
        const guildId = process.env.DISCORD_GUILD_ID || config.guildId;

        // Skip deployment if DISABLE_AUTO_DEPLOY is set (useful for local dev)
        if (process.env.DISABLE_AUTO_DEPLOY === 'true') {
            log.info('Auto-deploy disabled (DISABLE_AUTO_DEPLOY=true)');
            return;
        }

        if (!token || !clientId) {
            log.warn('Missing token or clientId, skipping command deployment');
            return;
        }

        // Deploy commands (use guildId if provided for faster updates, otherwise deploy globally)
        try {
            await deployCommands(token, clientId, guildId || null);
        } catch (error) {
            // Don't crash the bot if command deployment fails
            log.error('Command deployment failed, but bot will continue running');
        }
    },
};
