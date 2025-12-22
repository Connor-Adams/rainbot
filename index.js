const { Client, GatewayIntentBits, Events } = require('discord.js');
const server = require('./server');
const { loadConfig } = require('./utils/config');
const { createLogger } = require('./utils/logger');

const log = createLogger('MAIN');
const config = loadConfig();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
    ],
});

// Load handlers
require('./handlers/commandHandler')(client);
require('./handlers/eventHandler')(client);

// Start Express server once bot is ready
client.once(Events.ClientReady, () => {
    const port = config.dashboardPort;
    server.start(client, port);
});

// Validate bot token
if (!config.token) {
    log.error('Error: Discord bot token not found. Set DISCORD_BOT_TOKEN environment variable or configure config.json');
    process.exit(1);
}

client.login(config.token);
