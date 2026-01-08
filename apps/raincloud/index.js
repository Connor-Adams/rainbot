// Using tsx to run TypeScript files directly

// Load environment variables from .env file (if it exists)
// This must be loaded before any other modules that use process.env
const dotenvResult = require('dotenv').config();
if (dotenvResult.error) {
  // .env file doesn't exist - that's fine, we'll use system env vars
} else if (dotenvResult.parsed) {
  console.log(`[MAIN] Loaded ${Object.keys(dotenvResult.parsed).length} variables from .env file`);
}

const { Client, GatewayIntentBits, Events } = require('discord.js');
const server = require('./dist/server');
const { loadConfig } = require('./dist/utils/config');
const { createLogger } = require('./dist/utils/logger');

const log = createLogger('MAIN');

// Debug: Log all process.env keys (for Railway debugging)
if (process.env.RAILWAY_ENVIRONMENT) {
  log.info('Running on Railway');
  const allEnvKeys = Object.keys(process.env);
  log.debug(`Total environment variables: ${allEnvKeys.length}`);
  const discordKeys = allEnvKeys.filter(
    (k) => k.includes('DISCORD') || k.includes('SESSION') || k.includes('REQUIRED')
  );
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
      },
    });
    log.info('Spotify credentials configured for play-dl');
  } catch (error) {
    log.warn(`Failed to configure Spotify credentials: ${error.message}`);
    log.warn('Spotify links will not work without valid credentials');
  }
} else {
  log.warn(
    'Spotify credentials not configured. Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET environment variables to enable Spotify support.'
  );
}

// Initialize database (non-blocking, handles errors gracefully)
const { initDatabase } = require('./dist/utils/database');
initDatabase();

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
});

// Load handlers (still JS files, not in dist)
require('./handlers/commandHandler')(client);
require('./handlers/eventHandler')(client);

// Start Express server once bot is ready
client.once(Events.ClientReady, async () => {
  const port = config.dashboardPort;
  await server.start(client, port);

  // Initialize voice interaction manager if configured
  try {
    const { initVoiceInteractionManager } = require('./dist/utils/voice/voiceInteractionInstance');
    const voiceInteractionConfig = {
      enabled: config.voiceInteractionEnabled || false,
      sttProvider: config.sttProvider || 'google',
      ttsProvider: config.ttsProvider || 'google',
      sttApiKey: config.sttApiKey,
      ttsApiKey: config.ttsApiKey,
      language: config.voiceLanguage || 'en-US',
      voiceName: config.ttsVoiceName,
    };

    initVoiceInteractionManager(client, voiceInteractionConfig);
    log.info('Voice interaction system initialized');
  } catch (error) {
    log.warn(`Voice interaction not available: ${error.message}`);
  }
});

// Validate bot token
if (!config.token) {
  log.error('Error: Discord bot token not found. Set DISCORD_BOT_TOKEN environment variable');
  process.exit(1);
}

client.login(config.token);

// Graceful shutdown - save queue snapshots and flush statistics
async function gracefulShutdown(signal) {
  log.info(`Received ${signal}, shutting down gracefully...`);

  const { saveAllQueueSnapshots, stopAutoSave } = require('./dist/utils/voiceManager');

  // Stop auto-save interval
  stopAutoSave();

  // Save final queue snapshots
  await saveAllQueueSnapshots();

  // Cleanup voice interaction manager
  try {
    const { cleanupVoiceInteraction } = require('./dist/utils/voice/voiceInteractionInstance');
    await cleanupVoiceInteraction();
  } catch (error) {
    log.warn(`Error cleaning up voice interaction: ${error.message}`);
  }

  // Flush statistics buffers
  const { flushAll } = require('./dist/utils/statistics');
  await flushAll();

  // Close database connection
  const { close } = require('./dist/utils/database');
  await close();

  log.info('Shutdown complete');
  process.exit(0);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
