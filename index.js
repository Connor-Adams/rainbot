const { Client, GatewayIntentBits, Events } = require('discord.js');
const server = require('./server');

// Use environment variables, fallback to config.json for local development
let config;
try {
    config = require('./config.json');
} catch (e) {
    config = {};
}

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
    // Railway provides PORT environment variable, fallback to config or 3000
    const port = process.env.PORT || config.dashboardPort || 3000;
    server.start(client, port);
});

// Use environment variable for bot token, fallback to config
const botToken = process.env.DISCORD_BOT_TOKEN || config.token;
if (!botToken) {
    console.error('Error: Discord bot token not found. Set DISCORD_BOT_TOKEN environment variable.');
    process.exit(1);
}

client.login(botToken);
