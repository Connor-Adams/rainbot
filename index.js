// Register TypeScript loader (ts-node) to enable require() of .ts files
require('ts-node/register');

// Load environment variables from .env file (if it exists)
// This must be loaded before any other modules that use process.env
const dotenvResult = require('dotenv').config();
if (dotenvResult.error) {
    // .env file doesn't exist - that's fine, we'll use system env vars
} else if (dotenvResult.parsed) {
    console.log(`[MAIN] Loaded ${Object.keys(dotenvResult.parsed).length} variables from .env file`);
}

const { Client, GatewayIntentBits, Events } = require('discord.js');
const server = require('./server');
const { loadConfig } = require('./utils/config');
const { createLogger } = require('./utils/logger');

const log = createLogger('MAIN');

// Debug: Log all process.env keys (for Railway debugging)
if (process.env.RAILWAY_ENVIRONMENT) {
    log.info('Running on Railway');
    const allEnvKeys = Object.keys(process.env);
    log.debug(`Total environment variables: ${allEnvKeys.length}`);
    const discordKeys = allEnvKeys.filter(k => k.includes('DISCORD') || k.includes('SESSION') || k.includes('REQUIRED'));
    if (discordKeys.length > 0) {
        log.info(`Railway env vars found: ${discordKeys.join(', ')}`);
    } else {
        log.error('No Discord/Session env vars found in Railway! Check Railway dashboard settings.');
    }
}

const config = loadConfig();

// Initialize play-dl with Spotify credentials (if provided)
const play = require('play-dl');
if (config.spotifyClientId && config.spotifyClientSecret) {
    try {
        play.setToken({
            spotify: {
                client_id: config.spotifyClientId,
                client_secret: config.spotifyClientSecret,
            }
        });
        log.info('Spotify credentials configured for play-dl');
    } catch (error) {
        log.warn(`Failed to configure Spotify credentials: ${error.message}`);
        log.warn('Spotify links will not work without valid credentials');
    }
} else {
    log.warn('Spotify credentials not configured. Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET environment variables to enable Spotify support.');
}

// Initialize database (non-blocking, handles errors gracefully)
const { initDatabase } = require('./utils/database');
initDatabase();

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
client.once(Events.ClientReady, async () => {
    const port = config.dashboardPort;
    await server.start(client, port);
});

// Validate bot token
if (!config.token) {
    log.error('Error: Discord bot token not found. Set DISCORD_BOT_TOKEN environment variable');
    process.exit(1);
}

client.login(config.token);

// Graceful shutdown - flush statistics
process.on('SIGINT', async () => {
    log.info('Shutting down gracefully...');
    const { flushAll } = require('./utils/statistics');
    await flushAll();
    const { close } = require('./utils/database');
    await close();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    log.info('Shutting down gracefully...');
    const { flushAll } = require('./utils/statistics');
    await flushAll();
    const { close } = require('./utils/database');
    await close();
    process.exit(0);
});
