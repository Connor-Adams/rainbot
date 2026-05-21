// Mock the logger to prevent console output during tests
jest.mock('../logger', () => ({
  createLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    http: jest.fn(),
  }),
}));

describe('config', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };

    // Clear environment variables
    Object.keys(process.env).forEach((key) => {
      if (
        key.startsWith('DISCORD_') ||
        key.startsWith('SESSION_') ||
        key.startsWith('REQUIRED_') ||
        key.startsWith('STORAGE_') ||
        key.startsWith('SPOTIFY_') ||
        key.startsWith('AWS_') ||
        key === 'PORT' ||
        key === 'CALLBACK_URL' ||
        key === 'RAILWAY_PUBLIC_DOMAIN' ||
        key === 'DISABLE_AUTO_DEPLOY' ||
        key === 'DATABASE_URL' ||
        key === 'BUCKET' ||
        key === 'ACCESS_KEY_ID' ||
        key === 'SECRET_ACCESS_KEY' ||
        key === 'ENDPOINT' ||
        key === 'REGION'
      ) {
        delete process.env[key];
      }
    });

    // Clear any cached config by requiring a fresh instance
    jest.resetModules();
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
    jest.resetModules();
  });

  describe('loadConfig', () => {
    it('loads all required configuration from environment variables', () => {
      process.env['DISCORD_BOT_TOKEN'] = 'test-token';
      process.env['DISCORD_CLIENT_ID'] = 'test-client-id';
      process.env['DISCORD_CLIENT_SECRET'] = 'test-client-secret';
      process.env['SESSION_SECRET'] = 'test-session-secret';
      process.env['REQUIRED_ROLE_ID'] = 'test-role-id';

      const { loadConfig } = require('../config');
      const config = loadConfig();

      expect(config.token).toBe('test-token');
      expect(config.clientId).toBe('test-client-id');
      expect(config.discordClientSecret).toBe('test-client-secret');
      expect(config.sessionSecret).toBe('test-session-secret');
      expect(config.requiredRoleId).toBe('test-role-id');
    });

    it('loads optional configuration from environment variables', () => {
      process.env['DISCORD_GUILD_ID'] = 'test-guild-id';
      process.env['CALLBACK_URL'] = 'https://example.com/callback';
      process.env['PORT'] = '8080';
      process.env['SESSION_STORE_PATH'] = './custom-sessions';
      process.env['REDIS_URL'] = 'redis://localhost:6379';
      process.env['RAILWAY_PUBLIC_DOMAIN'] = 'example.railway.app';
      process.env['DATABASE_URL'] = 'postgresql://localhost/testdb';

      const { loadConfig } = require('../config');
      const config = loadConfig();

      expect(config.guildId).toBe('test-guild-id');
      expect(config.callbackURL).toBe('https://example.com/callback');
      expect(config.dashboardPort).toBe('8080');
      expect(config.sessionStorePath).toBe('./custom-sessions');
      expect(config.redisUrl).toBe('redis://localhost:6379');
      expect(config.railwayPublicDomain).toBe('example.railway.app');
      expect(config.databaseUrl).toBe('postgresql://localhost/testdb');
    });

    it('loads storage configuration with AWS prefix', () => {
      process.env['AWS_S3_BUCKET_NAME'] = 'test-bucket';
      process.env['AWS_ACCESS_KEY_ID'] = 'test-access-key';
      process.env['AWS_SECRET_ACCESS_KEY'] = 'test-secret-key';
      process.env['AWS_ENDPOINT_URL'] = 'https://s3.example.com';
      process.env['AWS_DEFAULT_REGION'] = 'us-west-2';

      const { loadConfig } = require('../config');
      const config = loadConfig();

      expect(config.storageBucketName).toBe('test-bucket');
      expect(config.storageAccessKey).toBe('test-access-key');
      expect(config.storageSecretKey).toBe('test-secret-key');
      expect(config.storageEndpoint).toBe('https://s3.example.com');
      expect(config.storageRegion).toBe('us-west-2');
    });

    it('loads storage configuration with legacy Railway variables', () => {
      process.env['BUCKET'] = 'legacy-bucket';
      process.env['ACCESS_KEY_ID'] = 'legacy-access-key';
      process.env['SECRET_ACCESS_KEY'] = 'legacy-secret-key';
      process.env['ENDPOINT'] = 'https://legacy.s3.example.com';
      process.env['REGION'] = 'eu-west-1';

      const { loadConfig } = require('../config');
      const config = loadConfig();

      expect(config.storageBucketName).toBe('legacy-bucket');
      expect(config.storageAccessKey).toBe('legacy-access-key');
      expect(config.storageSecretKey).toBe('legacy-secret-key');
      expect(config.storageEndpoint).toBe('https://legacy.s3.example.com');
      expect(config.storageRegion).toBe('eu-west-1');
    });

    it('loads storage configuration with STORAGE_ prefix', () => {
      process.env['STORAGE_BUCKET_NAME'] = 'storage-bucket';
      process.env['STORAGE_ACCESS_KEY'] = 'storage-access-key';
      process.env['STORAGE_SECRET_KEY'] = 'storage-secret-key';
      process.env['STORAGE_ENDPOINT'] = 'https://storage.example.com';
      process.env['STORAGE_REGION'] = 'ap-southeast-1';

      const { loadConfig } = require('../config');
      const config = loadConfig();

      expect(config.storageBucketName).toBe('storage-bucket');
      expect(config.storageAccessKey).toBe('storage-access-key');
      expect(config.storageSecretKey).toBe('storage-secret-key');
      expect(config.storageEndpoint).toBe('https://storage.example.com');
      expect(config.storageRegion).toBe('ap-southeast-1');
    });

    it('prioritizes AWS_ prefix over legacy variables for storage', () => {
      process.env['AWS_S3_BUCKET_NAME'] = 'aws-bucket';
      process.env['BUCKET'] = 'legacy-bucket';

      const { loadConfig } = require('../config');
      const config = loadConfig();

      expect(config.storageBucketName).toBe('aws-bucket');
    });

    it('loads Spotify configuration', () => {
      process.env['SPOTIFY_CLIENT_ID'] = 'spotify-client-id';
      process.env['SPOTIFY_CLIENT_SECRET'] = 'spotify-client-secret';

      const { loadConfig } = require('../config');
      const config = loadConfig();

      expect(config.spotifyClientId).toBe('spotify-client-id');
      expect(config.spotifyClientSecret).toBe('spotify-client-secret');
    });

    it('uses default port when PORT is not set', () => {
      delete process.env['PORT'];

      const { loadConfig } = require('../config');
      const config = loadConfig();

      expect(config.dashboardPort).toBe(3000);
    });

    it('uses default session store path when not set', () => {
      delete process.env['SESSION_STORE_PATH'];

      const { loadConfig } = require('../config');
      const config = loadConfig();

      expect(config.sessionStorePath).toBe('./sessions');
    });

    it('uses default storage region when not set', () => {
      delete process.env['AWS_DEFAULT_REGION'];
      delete process.env['REGION'];
      delete process.env['STORAGE_REGION'];

      const { loadConfig } = require('../config');
      const config = loadConfig();

      expect(config.storageRegion).toBe('us-east-1');
    });

    it('sets disableAutoDeploy to true when DISABLE_AUTO_DEPLOY is "true"', () => {
      process.env['DISABLE_AUTO_DEPLOY'] = 'true';

      const { loadConfig } = require('../config');
      const config = loadConfig();

      expect(config.disableAutoDeploy).toBe(true);
    });

    it('sets disableAutoDeploy to false when DISABLE_AUTO_DEPLOY is not "true"', () => {
      process.env['DISABLE_AUTO_DEPLOY'] = 'false';

      const { loadConfig } = require('../config');
      const config = loadConfig();

      expect(config.disableAutoDeploy).toBe(false);
    });

    it('sets disableAutoDeploy to false when DISABLE_AUTO_DEPLOY is not set', () => {
      delete process.env['DISABLE_AUTO_DEPLOY'];

      const { loadConfig } = require('../config');
      const config = loadConfig();

      expect(config.disableAutoDeploy).toBe(false);
    });

    it('returns undefined for missing optional configuration', () => {
      // Only set required config to avoid warnings
      process.env['DISCORD_BOT_TOKEN'] = 'test-token';

      const { loadConfig } = require('../config');
      const config = loadConfig();

      expect(config.guildId).toBeUndefined();
      expect(config.callbackURL).toBeUndefined();
      expect(config.redisUrl).toBeUndefined();
      expect(config.railwayPublicDomain).toBeUndefined();
      expect(config.databaseUrl).toBeUndefined();
      expect(config.storageBucketName).toBeUndefined();
      expect(config.spotifyClientId).toBeUndefined();
    });

    it('returns the same cached config on subsequent calls', () => {
      process.env['DISCORD_BOT_TOKEN'] = 'test-token';
      process.env['DISCORD_CLIENT_ID'] = 'test-client-id';

      const { loadConfig } = require('../config');
      const config1 = loadConfig();
      const config2 = loadConfig();

      expect(config1).toBe(config2); // Same reference
    });

    it('handles missing required configuration gracefully', () => {
      // Clear all environment variables
      delete process.env['DISCORD_BOT_TOKEN'];
      delete process.env['DISCORD_CLIENT_ID'];
      delete process.env['DISCORD_CLIENT_SECRET'];
      delete process.env['SESSION_SECRET'];
      delete process.env['REQUIRED_ROLE_ID'];

      const { loadConfig } = require('../config');
      const config = loadConfig();

      expect(config.token).toBeUndefined();
      expect(config.clientId).toBeUndefined();
      expect(config.discordClientSecret).toBeUndefined();
      expect(config.sessionSecret).toBeUndefined();
      expect(config.requiredRoleId).toBeUndefined();
      // Should still return a valid config object with defaults
      expect(config.dashboardPort).toBe(3000);
      expect(config.sessionStorePath).toBe('./sessions');
      expect(config.storageRegion).toBe('us-east-1');
      expect(config.disableAutoDeploy).toBe(false);
    });

    it('returns a config object with the correct type signature', () => {
      const { loadConfig } = require('../config');
      const config = loadConfig();

      expect(config).toHaveProperty('token');
      expect(config).toHaveProperty('clientId');
      expect(config).toHaveProperty('guildId');
      expect(config).toHaveProperty('discordClientSecret');
      expect(config).toHaveProperty('callbackURL');
      expect(config).toHaveProperty('requiredRoleId');
      expect(config).toHaveProperty('dashboardPort');
      expect(config).toHaveProperty('sessionSecret');
      expect(config).toHaveProperty('sessionStorePath');
      expect(config).toHaveProperty('redisUrl');
      expect(config).toHaveProperty('railwayPublicDomain');
      expect(config).toHaveProperty('storageBucketName');
      expect(config).toHaveProperty('storageAccessKey');
      expect(config).toHaveProperty('storageSecretKey');
      expect(config).toHaveProperty('storageEndpoint');
      expect(config).toHaveProperty('storageRegion');
      expect(config).toHaveProperty('disableAutoDeploy');
      expect(config).toHaveProperty('databaseUrl');
      expect(config).toHaveProperty('spotifyClientId');
      expect(config).toHaveProperty('spotifyClientSecret');
    });
  });
});
