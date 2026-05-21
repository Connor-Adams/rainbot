import { createLogger } from '@rainbot/shared';

export const PORT = parseInt(process.env['PORT'] || process.env['RAINBOT_PORT'] || '3001', 10);
export const TOKEN = process.env['RAINBOT_TOKEN'];
export const ORCHESTRATOR_BOT_ID =
  process.env['ORCHESTRATOR_BOT_ID'] || process.env['RAINCLOUD_BOT_ID'];
export const RAINCLOUD_URL = process.env['RAINCLOUD_URL'];
export const WORKER_SECRET = process.env['WORKER_SECRET'];

export const log = createLogger('RAINBOT');
export const hasToken = !!TOKEN;
export const hasOrchestrator = !!ORCHESTRATOR_BOT_ID;
