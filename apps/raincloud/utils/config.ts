import { createLogger } from './logger.ts';
import process from 'node:process';

const log = createLogger('CONFIG');

// Cache the config so we only load/log once
let cachedConfig: AppConfig | null = null;

export interface AppConfig {
  // Bot configuration
  token: string | undefined;
  clientId: string | undefined;
  guildId: string | undefined;

  // OAuth configuration
  discordClientSecret: string | undefined;
  callbackURL: string | undefined;
  requiredRoleId: string | undefined;

  // Server configuration
  dashboardPort: number | string;
  sessionSecret: string | undefined;
  sessionStorePath: string;
  redisUrl: string | undefined;

  // Railway-specific
  railwayPublicDomain: string | undefined;

  // Storage configuration
  storageBucketName: string | undefined;
  storageAccessKey: string | undefined;
  storageSecretKey: string | undefined;
  storageEndpoint: string | undefined;
  storageRegion: string;

  // Feature flags
  disableAutoDeploy: boolean;

  // Database configuration
  databaseUrl: string | undefined;

  // Spotify configuration
  spotifyClientId: string | undefined;
  spotifyClientSecret: string | undefined;

  // Voice interaction configuration
  voiceInteractionEnabled: boolean;
  sttProvider: string;
  ttsProvider: string;
  sttApiKey: string | undefined;
  ttsApiKey: string | undefined;
  voiceLanguage: string;
  ttsVoiceName: string | undefined;
}

/**
 * Load configuration from environment variables (.env file or env)
 * dotenv is loaded in index.js before this module is required
 * Provides consistent config loading across the application
 * Results are cached to avoid duplicate logging
 */
export function loadConfig(): AppConfig {
  // Return cached config if already loaded
  if (cachedConfig) {
    return cachedConfig;
  }

  // Debug: Log all environment variables that start with DISCORD_ or SESSION_ or REQUIRED_ or STORAGE_
  // Also includes Railway's auto-injected bucket vars: BUCKET, ACCESS_KEY_ID, SECRET_ACCESS_KEY, ENDPOINT, REGION
  const env =
    typeof Deno !== 'undefined'
      ? Deno.env.toObject()
      : typeof process !== 'undefined'
        ? process.env
        : {};
  const relevantEnvVars = Object.keys(env).filter(
    (key) =>
      key.startsWith('RAINCLOUD_') ||
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
      const value = env[key];
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
  const config: AppConfig = {
    // Bot configuration
    // RAINCLOUD_TOKEN is preferred, DISCORD_BOT_TOKEN is legacy fallback
    token: env['RAINCLOUD_TOKEN'] || env['DISCORD_BOT_TOKEN'],
    clientId: env['DISCORD_CLIENT_ID'],
    guildId: env['DISCORD_GUILD_ID'],

    // OAuth configuration
    discordClientSecret: env['DISCORD_CLIENT_SECRET'],
    callbackURL: env['CALLBACK_URL'],
    requiredRoleId: env['REQUIRED_ROLE_ID'],

    // Server configuration
    dashboardPort: env['PORT'] || 3000,
    sessionSecret: env['SESSION_SECRET'],
    sessionStorePath: env['SESSION_STORE_PATH'] || './sessions',
    redisUrl: env['REDIS_URL'],

    // Railway-specific
    railwayPublicDomain: env['RAILWAY_PUBLIC_DOMAIN'],

    // Storage configuration (Railway S3-compatible buckets)
    storageBucketName: env['AWS_S3_BUCKET_NAME'] || env['BUCKET'] || env['STORAGE_BUCKET_NAME'],
    storageAccessKey: env['AWS_ACCESS_KEY_ID'] || env['ACCESS_KEY_ID'] || env['STORAGE_ACCESS_KEY'],
    storageSecretKey:
      env['AWS_SECRET_ACCESS_KEY'] || env['SECRET_ACCESS_KEY'] || env['STORAGE_SECRET_KEY'],
    storageEndpoint: env['AWS_ENDPOINT_URL'] || env['ENDPOINT'] || env['STORAGE_ENDPOINT'],
    storageRegion:
      env['AWS_DEFAULT_REGION'] || env['REGION'] || env['STORAGE_REGION'] || 'us-east-1',

    // Feature flags
    disableAutoDeploy: env['DISABLE_AUTO_DEPLOY'] === 'true',

    // Database configuration
    databaseUrl: env['DATABASE_URL'],

    // Spotify configuration (for play-dl)
    spotifyClientId: env['SPOTIFY_CLIENT_ID'],
    spotifyClientSecret: env['SPOTIFY_CLIENT_SECRET'],

    // Voice interaction configuration
    voiceInteractionEnabled: env['VOICE_INTERACTION_ENABLED'] === 'true',
    sttProvider: env['STT_PROVIDER'] || 'openai',
    ttsProvider: env['TTS_PROVIDER'] || 'openai',
    sttApiKey: env['STT_API_KEY'],
    ttsApiKey: env['TTS_API_KEY'],
    voiceLanguage: env['VOICE_LANGUAGE'] || 'en-US',
    ttsVoiceName: env['TTS_VOICE_NAME'],
  };

  // Log which environment variables are set (for debugging)
  const envVarsUsed: string[] = [];
  const missingVars: string[] = [];

  if (env['DISCORD_BOT_TOKEN']) {
    envVarsUsed.push('DISCORD_BOT_TOKEN');
  } else {
    missingVars.push('DISCORD_BOT_TOKEN');
  }

  if (env['DISCORD_CLIENT_ID']) {
    envVarsUsed.push('DISCORD_CLIENT_ID');
  } else {
    missingVars.push('DISCORD_CLIENT_ID');
  }

  if (env['DISCORD_CLIENT_SECRET']) {
    envVarsUsed.push('DISCORD_CLIENT_SECRET');
  } else {
    missingVars.push('DISCORD_CLIENT_SECRET');
  }

  if (env['SESSION_SECRET']) {
    envVarsUsed.push('SESSION_SECRET');
  } else {
    missingVars.push('SESSION_SECRET');
  }

  if (env['REQUIRED_ROLE_ID']) {
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
  const missing: string[] = [];
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
