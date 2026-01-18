import { EventEmitter } from 'events';
import { createLogger } from '../logger';

export const log = createLogger('STATS');

// Emitter for notifying runtime listeners (SSE/WebSocket) about stats writes
export const statsEmitter = new EventEmitter();

// Batch processing configuration
export const BATCH_SIZE = 100;
export const BATCH_INTERVAL = 5000; // 5 seconds
