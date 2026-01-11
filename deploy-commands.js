// Manual command deployment script
// Note: Commands are automatically deployed on bot startup, but you can use this script
// to deploy commands without starting the bot

import process from 'node:process';
const { deployCommands } = require('./dist/utils/deployCommands');
const { loadConfig } = require('./dist/utils/config');
const { createLogger } = require('./dist/utils/logger');

const log = createLogger('DEPLOY');

const config = loadConfig();

if (!config.token || !config.clientId) {
  log.error('Missing DISCORD_BOT_TOKEN or DISCORD_CLIENT_ID');
  log.error('Set environment variables (DISCORD_BOT_TOKEN and DISCORD_CLIENT_ID)');
  process.exit(1);
}

(async () => {
  try {
    await deployCommands(config.token, config.clientId, config.guildId || null);
    process.exit(0);
  } catch (error) {
    log.error('Failed to deploy commands', { error: error.message });
    process.exit(1);
  }
})();
