const { createLogger } = require('./logger');

const log = createLogger('CONFIG');

/**
 * Load configuration from environment variables (.env file or process.env) with fallback to config.json
 * dotenv is loaded in index.js before this module is required
 * Provides consistent config loading across the application
 */
function loadConfig() {
    // Try to load config.json (for local development fallback)
    let fileConfig = {};
    try {
        fileConfig = require('../config.json');
        log.debug('Loaded config.json');
    } catch (e) {
        // config.json doesn't exist or can't be loaded - that's fine for production
        log.debug('config.json not found, using environment variables only');
    }
    
    // Check if .env file was loaded
    if (process.env.DOTENV_LOADED !== undefined || Object.keys(process.env).some(key => key.startsWith('DISCORD_'))) {
        log.debug('Environment variables loaded (from .env file or system env)');
    }

    // Build config object prioritizing environment variables
    const config = {
        // Bot configuration
        token: process.env.DISCORD_BOT_TOKEN || fileConfig.token,
        clientId: process.env.DISCORD_CLIENT_ID || fileConfig.clientId,
        guildId: process.env.DISCORD_GUILD_ID || fileConfig.guildId,
        
        // OAuth configuration
        discordClientSecret: process.env.DISCORD_CLIENT_SECRET || fileConfig.discordClientSecret,
        callbackURL: process.env.CALLBACK_URL || fileConfig.callbackURL,
        requiredRoleId: process.env.REQUIRED_ROLE_ID || fileConfig.requiredRoleId,
        
        // Server configuration
        dashboardPort: process.env.PORT || fileConfig.dashboardPort || 3000,
        sessionSecret: process.env.SESSION_SECRET || fileConfig.sessionSecret,
        sessionStorePath: process.env.SESSION_STORE_PATH || fileConfig.sessionStorePath || './sessions',
        
        // Railway-specific
        railwayPublicDomain: process.env.RAILWAY_PUBLIC_DOMAIN,
        
        // Feature flags
        disableAutoDeploy: process.env.DISABLE_AUTO_DEPLOY === 'true',
    };

    // Log which source is being used (for debugging)
    const envVarsUsed = [];
    const fileVarsUsed = [];
    
    if (process.env.DISCORD_BOT_TOKEN) envVarsUsed.push('DISCORD_BOT_TOKEN');
    else if (fileConfig.token) fileVarsUsed.push('token');
    
    if (process.env.DISCORD_CLIENT_ID) envVarsUsed.push('DISCORD_CLIENT_ID');
    else if (fileConfig.clientId) fileVarsUsed.push('clientId');
    
    if (process.env.DISCORD_CLIENT_SECRET) envVarsUsed.push('DISCORD_CLIENT_SECRET');
    else if (fileConfig.discordClientSecret) fileVarsUsed.push('discordClientSecret');
    
    if (process.env.SESSION_SECRET) envVarsUsed.push('SESSION_SECRET');
    else if (fileConfig.sessionSecret) fileVarsUsed.push('sessionSecret');
    
    if (process.env.REQUIRED_ROLE_ID) envVarsUsed.push('REQUIRED_ROLE_ID');
    else if (fileConfig.requiredRoleId) fileVarsUsed.push('requiredRoleId');

    if (envVarsUsed.length > 0) {
        log.info(`Using environment variables: ${envVarsUsed.join(', ')}`);
    }
    if (fileVarsUsed.length > 0) {
        log.info(`Using config.json: ${fileVarsUsed.join(', ')}`);
    }

    // Validate required config
    const missing = [];
    if (!config.token) missing.push('DISCORD_BOT_TOKEN');
    if (!config.clientId) missing.push('DISCORD_CLIENT_ID');
    if (!config.discordClientSecret) missing.push('DISCORD_CLIENT_SECRET');
    if (!config.sessionSecret) missing.push('SESSION_SECRET');
    if (!config.requiredRoleId) missing.push('REQUIRED_ROLE_ID');

    if (missing.length > 0) {
        log.warn(`Missing required configuration: ${missing.join(', ')}`);
    }

    return config;
}

module.exports = {
    loadConfig,
};

