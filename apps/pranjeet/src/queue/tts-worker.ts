import IORedis from 'ioredis';
import { Worker } from 'bullmq';
import type { Logger } from '@rainbot/shared';
import { logErrorWithStack } from '@rainbot/worker-shared';
import { REDIS_URL } from '../config';
import { speakInGuild } from '../speak';

let redisClient: IORedis | null = null;
let _queueReady = false;

export function getRedisClient(): IORedis | null {
  return redisClient;
}

export function getQueueReady(): boolean {
  return _queueReady;
}

export interface StartTtsQueueOptions {
  hasToken: boolean;
  isClientReady: () => boolean;
  log: Logger;
}

export async function startTtsQueue(options: StartTtsQueueOptions): Promise<void> {
  const { hasToken, isClientReady, log: logger } = options;
  if (!REDIS_URL) return;

  try {
    const REDIS_CONNECT_TIMEOUT_MS = 10_000;
    const REDIS_MAX_RETRIES = 5;
    const connection = new IORedis(REDIS_URL, {
      maxRetriesPerRequest: null,
      connectTimeout: REDIS_CONNECT_TIMEOUT_MS,
      retryStrategy: (times: number) => {
        if (times > REDIS_MAX_RETRIES) {
          logger.warn(`TTS queue Redis gave up after ${REDIS_MAX_RETRIES} connection attempts`);
          return null;
        }
        return Math.min(1000 * 2 ** times, 10_000);
      },
    });
    connection.on('error', (err: Error) => {
      logger.warn(`TTS queue Redis error: ${err.message}`);
    });
    redisClient = connection;

    const worker = new Worker(
      'tts',
      async (job) => {
        if (!hasToken || !isClientReady()) {
          throw new Error('Bot not ready');
        }
        const { guildId, text, voice } = job.data as {
          guildId: string;
          text: string;
          voice?: string;
        };
        const result = await speakInGuild(guildId, text, voice);
        if (result.status === 'error') {
          throw new Error(result.message);
        }
        return { status: 'success' };
      },
      { connection, concurrency: 1 }
    );

    worker.on('failed', (job, err) => {
      logger.error(`TTS job failed ${job?.id}: ${err.message}`);
    });

    _queueReady = true;
    logger.info('TTS queue worker started');
  } catch (error) {
    logErrorWithStack(logger, 'Failed to start TTS queue worker', error);
    _queueReady = false;
  }
}
