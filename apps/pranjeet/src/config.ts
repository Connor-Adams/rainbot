import { createLogger } from '@rainbot/shared';

export const PORT = parseInt(process.env['PORT'] || process.env['PRANJEET_PORT'] || '3002', 10);
export const TOKEN = process.env['PRANJEET_TOKEN'];
export const TTS_API_KEY = process.env['TTS_API_KEY'] || process.env['OPENAI_API_KEY'];
export const TTS_PROVIDER = process.env['TTS_PROVIDER'] || 'openai';
export const TTS_VOICE = process.env['TTS_VOICE_NAME'] || 'alloy';
export const ORCHESTRATOR_BOT_ID =
  process.env['ORCHESTRATOR_BOT_ID'] || process.env['RAINCLOUD_BOT_ID'];
export const REDIS_URL = process.env['REDIS_URL'];
export const RAINCLOUD_URL = process.env['RAINCLOUD_URL'];
export const WORKER_SECRET = process.env['WORKER_SECRET'];
export const WORKER_INSTANCE_ID =
  process.env['RAILWAY_REPLICA_ID'] || process.env['RAILWAY_SERVICE_ID'] || process.env['HOSTNAME'];
export const WORKER_VERSION =
  process.env['RAILWAY_GIT_COMMIT_SHA'] || process.env['GIT_COMMIT_SHA'];
export const VOICE_INTERACTION_ENABLED = process.env['VOICE_INTERACTION_ENABLED'] === 'true';
export const VOICE_TRIGGER_WORD = process.env['VOICE_TRIGGER_WORD']?.trim() || 'evan';

export const log = createLogger('PRANJEET');
export const hasToken = !!TOKEN;
export const hasOrchestrator = !!ORCHESTRATOR_BOT_ID;
