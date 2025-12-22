// Manual command deployment script
// Note: Commands are automatically deployed on bot startup, but you can use this script
// to deploy commands without starting the bot

const { deployCommands } = require('./utils/deployCommands');

// Use environment variables, fallback to config.json
let config;
try {
    config = require('./config.json');
} catch (e) {
    config = {};
}

const token = process.env.DISCORD_BOT_TOKEN || config.token;
const clientId = process.env.DISCORD_CLIENT_ID || config.clientId;
const guildId = process.env.DISCORD_GUILD_ID || config.guildId;

if (!token || !clientId) {
    console.error('Error: Missing DISCORD_BOT_TOKEN or DISCORD_CLIENT_ID');
    console.error('Set environment variables or configure config.json');
    process.exit(1);
}

(async () => {
    try {
        await deployCommands(token, clientId, guildId || null);
        process.exit(0);
    } catch (error) {
        console.error('Failed to deploy commands:', error);
        process.exit(1);
    }
})();

