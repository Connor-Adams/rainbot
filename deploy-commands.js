// Manual command deployment script
// Note: Commands are automatically deployed on bot startup, but you can use this script
// to deploy commands without starting the bot

// Must be run from the repo root after `yarn build:ts` - the @rainbot/utils
// subpath exports resolve against packages/utils/dist/, which only exists once built.

const { deployCommands } = require('@rainbot/utils/deployCommands');
const { loadConfig } = require('@rainbot/utils/config');

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
