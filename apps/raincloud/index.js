// Using tsx to run TypeScript files directly

// Load environment variables from .env file (if it exists)
// This must be loaded before any other modules that use process.env
const dotenvResult = require('dotenv').config();
if (dotenvResult.error) {
  // .env file doesn't exist - that's fine, we'll use system env vars
} else if (dotenvResult.parsed) {
  console.log(`[MAIN] Loaded ${Object.keys(dotenvResult.parsed).length} variables from .env file`);
}

// Resolve TS path aliases in compiled JS at runtime
const path = require('path');
const Module = require('module');
const originalResolveFilename = Module._resolveFilename;
const aliasRoot = path.join(__dirname, 'dist');
const aliasMap = {
  '@utils': path.join(aliasRoot, 'utils'),
  '@server': path.join(aliasRoot, 'apps', 'raincloud', 'server'),
  '@handlers': path.join(aliasRoot, 'apps', 'raincloud', 'handlers'),
  '@events': path.join(aliasRoot, 'apps', 'raincloud', 'src', 'events'),
  '@components': path.join(aliasRoot, 'apps', 'raincloud', 'components'),
  '@lib': path.join(aliasRoot, 'apps', 'raincloud', 'lib'),
  '@commands': path.join(aliasRoot, 'apps', 'raincloud', 'commands'),
};

Module._resolveFilename = function (request, parent, isMain, options) {
  for (const [alias, target] of Object.entries(aliasMap)) {
    if (request === alias || request.startsWith(`${alias}/`)) {
      const remainder = request.length > alias.length ? request.slice(alias.length + 1) : '';
      const mapped = remainder ? path.join(target, remainder) : target;
      return originalResolveFilename.call(this, mapped, parent, isMain, options);
    }
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

const { Client, GatewayIntentBits, Events } = require('discord.js');
const server = require('./dist/apps/raincloud/server');
const { loadConfig } = require('./dist/utils/config');
const { createLogger } = require('./dist/utils/logger');

const log = createLogger('MAIN');

function formatError(err) {
  if (err instanceof Error) {
    return { message: err.message, stack: err.stack };
  }
  return { message: String(err) };
}

process.on('unhandledRejection', (reason) => {
  log.error('Unhandled promise rejection', formatError(reason));
});

process.on('uncaughtException', (error) => {
  log.error('Uncaught exception', formatError(error));
  process.exitCode = 1;
});

process.on('exit', (code) => {
  log.info(`Process exiting with code ${code}`);
});

log.info(`Starting Raincloud (pid=${process.pid}, node=${process.version})`);

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
log.info(
  `Config summary: token=${!!config.token}, clientId=${!!config.clientId}, sessionSecret=${!!config.sessionSecret}, databaseUrl=${!!config.databaseUrl}, redisUrl=${!!config.redisUrl}`
);

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
try {
  require('./handlers/commandHandler')(client);
  require('./handlers/eventHandler')(client);
} catch (error) {
  log.error('Failed to initialize handlers', formatError(error));
  process.exit(1);
}

// Start Express server once bot is ready
client.once(Events.ClientReady, async () => {
  log.info(`Discord client ready as ${client.user?.tag}`);
  const port = config.dashboardPort;
  try {
    await server.start(client, port);
    log.info(`Server started on port ${port}`);
  } catch (error) {
    log.error('Server failed to start', formatError(error));
  }

  // Initialize multi-bot service (worker orchestration)
  try {
    const MultiBotService = require('./dist/apps/raincloud/lib/multiBotService');
    const redisUrl = config.redisUrl || process.env['REDIS_URL'];
    const multiBot = await MultiBotService.default.initialize(redisUrl);
    multiBot.setDiscordClient(client);
    log.info('MultiBotService initialized');
  } catch (error) {
    log.warn(`MultiBotService unavailable: ${error.message}`);
  }
});

// Validate bot token
if (!config.token) {
  log.error('Error: Discord bot token not found. Set DISCORD_BOT_TOKEN environment variable');
  log.warn('Starting in degraded mode (no Discord connection)');
  const port = config.dashboardPort || 3000;
  server
    .createServer()
    .then((app) => {
      app.listen(port, () => {
        log.info(`Dashboard running in degraded mode at http://0.0.0.0:${port}`);
      });
    })
    .catch((error) => {
      log.error('Failed to start server in degraded mode', formatError(error));
    });
} else {
  client.login(config.token);
}

// Graceful shutdown - save queue snapshots and flush statistics
async function gracefulShutdown(signal) {
  log.info(`Received ${signal}, shutting down gracefully...`);

  const { saveAllQueueSnapshots, stopAutoSave } = require('./dist/utils/voiceManager');

  // Stop auto-save interval
  stopAutoSave();

  // Save final queue snapshots
  await saveAllQueueSnapshots();

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
