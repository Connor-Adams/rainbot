import { createLogger } from '@rainbot/shared';

export const PORT = parseInt(process.env['PORT'] || process.env['HUNGERBOT_PORT'] || '3003', 10);
export const TOKEN = process.env['HUNGERBOT_TOKEN'];
export const SOUNDS_DIR = process.env['SOUNDS_DIR'] || './sounds';
export const ORCHESTRATOR_BOT_ID =
  process.env['ORCHESTRATOR_BOT_ID'] || process.env['RAINCLOUD_BOT_ID'];
export const RAINCLOUD_URL = process.env['RAINCLOUD_URL'];
export const WORKER_SECRET = process.env['WORKER_SECRET'];

export const log = createLogger('HUNGERBOT');
export const hasToken = !!TOKEN;
export const hasOrchestrator = !!ORCHESTRATOR_BOT_ID;

// S3 Configuration
export const S3_BUCKET =
  process.env['AWS_S3_BUCKET_NAME'] || process.env['STORAGE_BUCKET_NAME'] || process.env['BUCKET'];
export const S3_ACCESS_KEY =
  process.env['AWS_ACCESS_KEY_ID'] ||
  process.env['STORAGE_ACCESS_KEY'] ||
  process.env['ACCESS_KEY_ID'];
export const S3_SECRET_KEY =
  process.env['AWS_SECRET_ACCESS_KEY'] ||
  process.env['STORAGE_SECRET_KEY'] ||
  process.env['SECRET_ACCESS_KEY'];
export const S3_ENDPOINT =
  process.env['AWS_ENDPOINT_URL'] || process.env['STORAGE_ENDPOINT'] || process.env['ENDPOINT'];
export const S3_REGION =
  process.env['AWS_DEFAULT_REGION'] || process.env['STORAGE_REGION'] || 'us-east-1';
