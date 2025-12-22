const { createLogger } = require('./logger');

const log = createLogger('CONFIG');

/**
 * Load configuration from environment variables (.env file or process.env) with fallback to config.json
 * dotenv is loaded in index.js before this module is required
 * Provides consistent config loading across the application
 */
function loadConfig() {
    // Debug: Log all environment variables that start with DISCORD_ or SESSION_ or REQUIRED_
    const relevantEnvVars = Object.keys(process.env).filter(key => 
        key.startsWith('DISCORD_') || 
        key.startsWith('SESSION_') || 
        key.startsWith('REQUIRED_') ||
        key === 'PORT' ||
        key === 'CALLBACK_URL' ||
        key === 'RAILWAY_PUBLIC_DOMAIN' ||
        key === 'DISABLE_AUTO_DEPLOY'
    );
    
    if (relevantEnvVars.length > 0) {
        log.info(`Found ${relevantEnvVars.length} relevant environment variables: ${relevantEnvVars.join(', ')}`);
        // Log values (masked for security)
        relevantEnvVars.forEach(key => {
            const value = process.env[key];
            if (value) {
                const masked = key.includes('SECRET') || key.includes('TOKEN') 
                    ? `${value.substring(0, 4)}...${value.substring(value.length - 4)}` 
                    : value;
                log.debug(`  ${key}=${masked}`);
            }
        });
    } else {
        log.warn('No relevant environment variables found!');
    }

    // Try to load config.json (for local development fallback)
    let fileConfig = {};
    try {
        fileConfig = require('../config.json');
        log.debug('Loaded config.json');
    } catch (e) {
        // config.json doesn't exist or can't be loaded - that's fine for production
        log.debug('config.json not found, using environment variables only');
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
    const missingVars = [];
    
    if (process.env.DISCORD_BOT_TOKEN) {
        envVarsUsed.push('DISCORD_BOT_TOKEN');
    } else if (fileConfig.token) {
        fileVarsUsed.push('token');
    } else {
        missingVars.push('DISCORD_BOT_TOKEN');
    }
    
    if (process.env.DISCORD_CLIENT_ID) {
        envVarsUsed.push('DISCORD_CLIENT_ID');
    } else if (fileConfig.clientId) {
        fileVarsUsed.push('clientId');
    } else {
        missingVars.push('DISCORD_CLIENT_ID');
    }
    
    if (process.env.DISCORD_CLIENT_SECRET) {
        envVarsUsed.push('DISCORD_CLIENT_SECRET');
    } else if (fileConfig.discordClientSecret) {
        fileVarsUsed.push('discordClientSecret');
    } else {
        missingVars.push('DISCORD_CLIENT_SECRET');
    }
    
    if (process.env.SESSION_SECRET) {
        envVarsUsed.push('SESSION_SECRET');
    } else if (fileConfig.sessionSecret) {
        fileVarsUsed.push('sessionSecret');
    } else {
        missingVars.push('SESSION_SECRET');
    }
    
    if (process.env.REQUIRED_ROLE_ID) {
        envVarsUsed.push('REQUIRED_ROLE_ID');
    } else if (fileConfig.requiredRoleId) {
        fileVarsUsed.push('requiredRoleId');
    } else {
        missingVars.push('REQUIRED_ROLE_ID');
    }

    if (envVarsUsed.length > 0) {
        log.info(`✓ Using environment variables: ${envVarsUsed.join(', ')}`);
    }
    if (fileVarsUsed.length > 0) {
        log.info(`✓ Using config.json: ${fileVarsUsed.join(', ')}`);
    }
    if (missingVars.length > 0) {
        log.error(`✗ Missing configuration: ${missingVars.join(', ')}`);
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

