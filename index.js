const { Client, GatewayIntentBits, Events } = require('discord.js');
const config = require('./config.json');
const server = require('./server');

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
    server.start(client, config.dashboardPort || 3000);
});

client.login(config.token);
