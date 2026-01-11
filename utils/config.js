import process from 'node:process';
('use strict');
Object.defineProperty(exports, '__esModule', { value: true });
exports.loadConfig = loadConfig;
const logger_1 = require('./logger');
const log = (0, logger_1.createLogger)('CONFIG');
// Cache the config so we only load/log once
let cachedConfig = null;
/**
 * Load configuration from environment variables (.env file or process.env)
 * dotenv is loaded in index.js before this module is required
 * Provides consistent config loading across the application
 * Results are cached to avoid duplicate logging
 */
function loadConfig() {
  // Return cached config if already loaded
  if (cachedConfig) {
    return cachedConfig;
  }
  // Debug: Log all environment variables that start with DISCORD_ or SESSION_ or REQUIRED_ or STORAGE_
  // Also includes Railway's auto-injected bucket vars: BUCKET, ACCESS_KEY_ID, SECRET_ACCESS_KEY, ENDPOINT, REGION
  const relevantEnvVars = Object.keys(process.env).filter(
    (key) =>
      key.startsWith('DISCORD_') ||
      key.startsWith('SESSION_') ||
      key.startsWith('REQUIRED_') ||
      key.startsWith('STORAGE_') ||
      key.startsWith('SPOTIFY_') ||
      key.startsWith('VOICE_') ||
      key.startsWith('STT_') ||
      key.startsWith('TTS_') ||
      key === 'PORT' ||
      key === 'CALLBACK_URL' ||
      key === 'RAILWAY_PUBLIC_DOMAIN' ||
      key === 'DISABLE_AUTO_DEPLOY' ||
      key === 'DATABASE_URL' ||
      // Railway Bucket service vars (AWS_* prefix)
      key.startsWith('AWS_') ||
      // Railway bucket legacy vars
      key === 'BUCKET' ||
      key === 'ACCESS_KEY_ID' ||
      key === 'SECRET_ACCESS_KEY' ||
      key === 'ENDPOINT' ||
      key === 'REGION'
  );
  if (relevantEnvVars.length > 0) {
    log.info(
      `Found ${relevantEnvVars.length} relevant environment variables: ${relevantEnvVars.join(', ')}`
    );
    // Log values (masked for security)
    relevantEnvVars.forEach((key) => {
      const value = process.env[key];
      if (value) {
        const shouldMask =
          key.includes('SECRET') || key.includes('TOKEN') || key === 'ACCESS_KEY_ID';
        const masked = shouldMask
          ? `${value.substring(0, 4)}...${value.substring(value.length - 4)}`
          : value;
        log.debug(`  ${key}=${masked}`);
      }
    });
  } else {
    log.warn('No relevant environment variables found!');
  }
  // Build config object from environment variables only
  const config = {
    // Bot configuration - use bot-specific tokens if available
    token:
      process.env['RAINBOT_TOKEN'] ||
      process.env['PRANJEET_TOKEN'] ||
      process.env['HUNGERBOT_TOKEN'] ||
      process.env['RAINCLOUD_TOKEN'] ||
      process.env['DISCORD_BOT_TOKEN'],
    clientId: process.env['DISCORD_CLIENT_ID'],
    guildId: process.env['DISCORD_GUILD_ID'],
    // OAuth configuration
    discordClientSecret: process.env['DISCORD_CLIENT_SECRET'],
    callbackURL: process.env['CALLBACK_URL'],
    requiredRoleId: process.env['REQUIRED_ROLE_ID'],
    // Server configuration
    dashboardPort: process.env['PORT'] || 3000,
    sessionSecret: process.env['SESSION_SECRET'],
    sessionStorePath: process.env['SESSION_STORE_PATH'] || './sessions',
    redisUrl: process.env['REDIS_URL'],
    // Railway-specific
    railwayPublicDomain: process.env['RAILWAY_PUBLIC_DOMAIN'],
    // Storage configuration (Railway S3-compatible buckets)
    storageBucketName:
      process.env['AWS_S3_BUCKET_NAME'] ||
      process.env['BUCKET'] ||
      process.env['STORAGE_BUCKET_NAME'],
    storageAccessKey:
      process.env['AWS_ACCESS_KEY_ID'] ||
      process.env['ACCESS_KEY_ID'] ||
      process.env['STORAGE_ACCESS_KEY'],
    storageSecretKey:
      process.env['AWS_SECRET_ACCESS_KEY'] ||
      process.env['SECRET_ACCESS_KEY'] ||
      process.env['STORAGE_SECRET_KEY'],
    storageEndpoint:
      process.env['AWS_ENDPOINT_URL'] || process.env['ENDPOINT'] || process.env['STORAGE_ENDPOINT'],
    storageRegion:
      process.env['AWS_DEFAULT_REGION'] ||
      process.env['REGION'] ||
      process.env['STORAGE_REGION'] ||
      'us-east-1',
    // Feature flags
    disableAutoDeploy: process.env['DISABLE_AUTO_DEPLOY'] === 'true',
    // Database configuration
    databaseUrl: process.env['DATABASE_URL'],
    // Spotify configuration (for play-dl)
    spotifyClientId: process.env['SPOTIFY_CLIENT_ID'],
    spotifyClientSecret: process.env['SPOTIFY_CLIENT_SECRET'],
    // Voice interaction configuration
    voiceInteractionEnabled: process.env['VOICE_INTERACTION_ENABLED'] === 'true',
    sttProvider: process.env['STT_PROVIDER'] || 'openai',
    ttsProvider: process.env['TTS_PROVIDER'] || 'openai',
    sttApiKey: process.env['STT_API_KEY'],
    ttsApiKey: process.env['TTS_API_KEY'],
    voiceLanguage: process.env['VOICE_LANGUAGE'] || 'en-US',
    ttsVoiceName: process.env['TTS_VOICE_NAME'],
  };
  // Log which environment variables are set (for debugging)
  const envVarsUsed = [];
  const missingVars = [];
  if (process.env['DISCORD_BOT_TOKEN']) {
    envVarsUsed.push('DISCORD_BOT_TOKEN');
  } else {
    missingVars.push('DISCORD_BOT_TOKEN');
  }
  if (process.env['DISCORD_CLIENT_ID']) {
    envVarsUsed.push('DISCORD_CLIENT_ID');
  } else {
    missingVars.push('DISCORD_CLIENT_ID');
  }
  if (process.env['DISCORD_CLIENT_SECRET']) {
    envVarsUsed.push('DISCORD_CLIENT_SECRET');
  } else {
    missingVars.push('DISCORD_CLIENT_SECRET');
  }
  if (process.env['SESSION_SECRET']) {
    envVarsUsed.push('SESSION_SECRET');
  } else {
    missingVars.push('SESSION_SECRET');
  }
  if (process.env['REQUIRED_ROLE_ID']) {
    envVarsUsed.push('REQUIRED_ROLE_ID');
  } else {
    missingVars.push('REQUIRED_ROLE_ID');
  }
  if (envVarsUsed.length > 0) {
    log.info(`✓ Using environment variables: ${envVarsUsed.join(', ')}`);
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
  // Cache for future calls
  cachedConfig = config;
  return config;
}
//# sourceMappingURL=config.js.map
