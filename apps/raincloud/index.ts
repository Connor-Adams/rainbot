// Load environment variables from .env file (if it exists)
// This must be loaded before any other modules that use Deno.env
const envPath = new URL('../../.env', import.meta.url).pathname;
try {
  const envContent = await Deno.readTextFile(envPath);
  for (const line of envContent.split('\n')) {
    const [key, value] = line.split('=');
    if (key && value) {
      Deno.env.set(key.trim(), value.trim());
    }
  }
  console.log(`[MAIN] Loaded environment variables from .env file`);
} catch (_error) {
  // .env file doesn't exist - that's fine, we'll use system env vars
}

import { Client, GatewayIntentBits, Events } from 'npm:discord.js@14.15.3';
import * as server from './server/index.ts';
import { loadConfig } from './utils/config.ts';
import { createLogger } from './utils/logger.ts';
import play from 'npm:play-dl@1.9.7';
import { initDatabase } from './utils/database.ts';

async function main() {
  const log = createLogger('MAIN');

  // Debug: Log all Deno.env keys (for Railway debugging)
  if (Deno.env.get('RAILWAY_ENVIRONMENT')) {
    log.info('Running on Railway');
    const allEnvKeys = Object.keys(Deno.env.toObject());
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
  initDatabase();

  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
  });

  // Load handlers (still JS files, not in dist)
  import('./handlers/commandHandler.js').then((module) => module.default(client));
  import('./handlers/eventHandler.js').then((module) => module.default(client));

  // Initialize voice interaction manager once bot is ready
  client.once(Events.ClientReady, async () => {
    // Initialize voice interaction manager if configured
    try {
      const { initVoiceInteractionManager } =
        await import('./utils/voice/voiceInteractionInstance.ts');
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
    log.warn(
      'Discord bot token not found. Starting web server only. Set DISCORD_BOT_TOKEN environment variable to enable Discord bot functionality'
    );
    // Start server without bot
    const port = config.dashboardPort;
    await server.start(null as any, port);
    log.info(`Web server started on port ${port} (bot not connected)`);
    return;
  }

  client.login(config.token);
}

// Graceful shutdown - save queue snapshots and flush statistics
async function gracefulShutdown(signal: string) {
  const log = createLogger('MAIN');
  log.info(`Received ${signal}, shutting down gracefully...`);

  const { saveAllQueueSnapshots, stopAutoSave } = await import('./utils/voiceManager.ts');

  // Stop auto-save interval
  stopAutoSave();

  // Save final queue snapshots
  await saveAllQueueSnapshots();

  // Cleanup voice interaction manager
  try {
    const { cleanupVoiceInteraction } = await import('./utils/voice/voiceInteractionInstance.ts');
    await cleanupVoiceInteraction();
  } catch (error) {
    log.warn(`Error cleaning up voice interaction: ${error.message}`);
  }

  // Flush statistics buffers
  const { flushAll } = await import('./utils/statistics.ts');
  await flushAll();

  // Close database connection
  const { close } = await import('./utils/database.ts');
  await close();

  log.info('Shutdown complete');
  Deno.exit(0);
}

Deno.addSignalListener('SIGINT', () => gracefulShutdown('SIGINT'));
Deno.addSignalListener('SIGTERM', () => gracefulShutdown('SIGTERM'));

// Start the application
main();
