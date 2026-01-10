export interface AppConfig {
  token: string | undefined;
  clientId: string | undefined;
  guildId: string | undefined;
  discordClientSecret: string | undefined;
  callbackURL: string | undefined;
  requiredRoleId: string | undefined;
  dashboardPort: number | string;
  sessionSecret: string | undefined;
  sessionStorePath: string;
  redisUrl: string | undefined;
  railwayPublicDomain: string | undefined;
  storageBucketName: string | undefined;
  storageAccessKey: string | undefined;
  storageSecretKey: string | undefined;
  storageEndpoint: string | undefined;
  storageRegion: string;
  disableAutoDeploy: boolean;
  databaseUrl: string | undefined;
  spotifyClientId: string | undefined;
  spotifyClientSecret: string | undefined;
  voiceInteractionEnabled: boolean;
  sttProvider: string;
  ttsProvider: string;
  sttApiKey: string | undefined;
  ttsApiKey: string | undefined;
  voiceLanguage: string;
  ttsVoiceName: string | undefined;
}
/**
 * Load configuration from environment variables (.env file or process.env)
 * dotenv is loaded in index.js before this module is required
 * Provides consistent config loading across the application
 * Results are cached to avoid duplicate logging
 */
export declare function loadConfig(): AppConfig;
//# sourceMappingURL=config.d.ts.map
