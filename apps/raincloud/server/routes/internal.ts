import express, { Request, Response } from 'express';
import { createLogger } from '../../utils/logger';
import { recordWorkerRegistration } from '../../lib/workerCoordinatorRegistry';

const log = createLogger('INTERNAL-ROUTES');
const router = express.Router();

const allowedBotTypes = new Set(['rainbot', 'pranjeet', 'hungerbot']);

router.post('/workers/register', (req: Request, res: Response) => {
  const workerSecret = process.env['WORKER_SECRET'];
  if (!workerSecret) {
    log.warn('WORKER_SECRET not configured; refusing worker registration');
    res.status(503).json({ error: 'Worker registration not configured' });
    return;
  }

  const providedSecret = req.header('x-worker-secret');
  if (!providedSecret || providedSecret !== workerSecret) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

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

export default router;
