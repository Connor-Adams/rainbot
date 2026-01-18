import express, { Request, Response } from 'express';
import { createLogger } from '@rainbot/utils';
import { recordWorkerRegistration } from '@rainbot/utils';
import * as stats from '@rainbot/utils';
import type { SourceType } from '@rainbot/utils';

const log = createLogger('INTERNAL-ROUTES');
const router = express.Router();

const allowedBotTypes = new Set(['rainbot', 'pranjeet', 'hungerbot']);

function requireWorkerSecret(req: Request, res: Response): boolean {
  const workerSecret = process.env['WORKER_SECRET'];
  if (!workerSecret) {
    log.warn('WORKER_SECRET not configured; refusing worker request');
    res.status(503).json({ error: 'Worker authentication not configured' });
    return false;
  }

  const providedSecret = req.header('x-worker-secret');
  if (!providedSecret || providedSecret !== workerSecret) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }

  return true;
}

router.post('/workers/register', (req: Request, res: Response) => {
  if (!requireWorkerSecret(req, res)) return;

  const { botType, instanceId, startedAt, version } = req.body as {
    botType?: string;
    instanceId?: string;
    startedAt?: string;
    version?: string;
  };

  if (!botType || !allowedBotTypes.has(botType)) {
    res.status(400).json({ error: 'Invalid botType' });
    return;
  }

  recordWorkerRegistration(botType as 'rainbot' | 'pranjeet' | 'hungerbot', {
    instanceId,
    startedAt,
    version,
  });

  log.info(`Registered ${botType} worker${instanceId ? ` (${instanceId})` : ''}`);
  res.json({ ok: true });
});

router.post('/stats/sound', (req: Request, res: Response) => {
  if (!requireWorkerSecret(req, res)) return;

  const {
    soundName,
    userId,
    guildId,
    sourceType,
    isSoundboard,
    duration,
    source,
    username,
    discriminator,
  } = req.body as {
    soundName?: string;
    userId?: string;
    guildId?: string;
    sourceType?: string;
    isSoundboard?: boolean;
    duration?: number | null;
    source?: string;
    username?: string | null;
    discriminator?: string | null;
  };

  if (!soundName || !userId || !guildId) {
    log.warn('Stats sound missing required fields');
    res.status(400).json({ error: 'Missing required fields' });
    return;
  }

  log.info(`Stats sound received guild=${guildId} sound=${soundName}`);

  stats.trackSound(
    soundName,
    userId,
    guildId,
    (sourceType || 'other') as SourceType,
    Boolean(isSoundboard),
    typeof duration === 'number' ? duration : null,
    source || 'discord',
    username || null,
    discriminator || null
  );

  res.json({ ok: true });
});

export default router;
