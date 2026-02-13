import { createLogger } from '@rainbot/shared';

export const PORT = parseInt(process.env['PORT'] || process.env['PRANJEET_PORT'] || '3002', 10);
export const TOKEN = process.env['PRANJEET_TOKEN'];
export const STT_API_KEY = process.env['STT_API_KEY'] || process.env['OPENAI_API_KEY'];
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
export const GROK_API_KEY = process.env['GROK_API_KEY'] || process.env['XAI_API_KEY'];
export const GROK_MODEL = process.env['GROK_MODEL'] || 'grok-4-1-fast-reasoning';
/** Voice Agent voice: Ara, Rex, Sal, Eve, Leo (default: Ara) */
export const GROK_VOICE = process.env['GROK_VOICE']?.trim() || 'Ara';
/** Enable music command tools in Voice Agent (play, skip, etc.). Set to "false" to disable. */
export const GROK_VOICE_AGENT_TOOLS = process.env['GROK_VOICE_AGENT_TOOLS'] !== 'false';
// Grok is enabled when an API key is set, unless explicitly disabled with GROK_ENABLED=false
const hasGrokKey = !!GROK_API_KEY;
export const GROK_ENABLED = process.env['GROK_ENABLED'] === 'false' ? false : hasGrokKey;

export const log = createLogger('PRANJEET');
export const hasToken = !!TOKEN;
export const hasOrchestrator = !!ORCHESTRATOR_BOT_ID;
