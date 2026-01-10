// Manual command deployment script
// Note: Commands are automatically deployed on bot startup, but you can use this script
// to deploy commands without starting the bot

const { deployCommands } = require('./dist/utils/deployCommands');
const { loadConfig } = require('./dist/utils/config');

const config = loadConfig();

if (!config.token || !config.clientId) {
  console.error('Error: Missing DISCORD_BOT_TOKEN or DISCORD_CLIENT_ID');
  console.error('Set environment variables (DISCORD_BOT_TOKEN and DISCORD_CLIENT_ID)');
  process.exit(1);
}

(async () => {
  try {
    await deployCommands(config.token, config.clientId, config.guildId || null);
    process.exit(0);
  } catch (error) {
    console.error('Failed to deploy commands:', error);
    process.exit(1);
  }
})();
