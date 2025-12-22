const { Events } = require('discord.js');
const { createLogger } = require('../utils/logger');

const log = createLogger('BOT');

module.exports = {
    name: Events.ClientReady,
    once: true,
    execute(client) {
        log.info(`Logged in as ${client.user.tag}`);
    },
};
