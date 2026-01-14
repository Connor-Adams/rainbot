import type { AppConfig } from '@rainbot/protocol';
import { loadConfig } from '../utils/config';

let serverConfig: AppConfig | null = null;

export function initServerConfig(): AppConfig {
  if (!serverConfig) {
    serverConfig = loadConfig();
  }
  return serverConfig;
}

export function getServerConfig(): AppConfig {
  if (!serverConfig) {
    throw new Error('Server config not initialized');
  }
  return serverConfig;
}
