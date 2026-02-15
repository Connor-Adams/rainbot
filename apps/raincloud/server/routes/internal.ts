import express, { Request, Response } from 'express';
import { createLogger } from '@utils/logger';
import { recordWorkerRegistration } from '../../lib/workerCoordinatorRegistry';
import { getMultiBotService } from '../../lib/multiBotService';
import * as stats from '@utils/statistics';
import * as storage from '@utils/storage';
import type { SourceType } from '@rainbot/types/media';

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

router.get('/cookies/youtube', async (req: Request, res: Response) => {
  if (!requireWorkerSecret(req, res)) return;

  try {
    const buf = await storage.getYoutubeCookies();
    if (!buf) {
      res.status(404).json({ error: 'No YouTube cookies configured' });
      return;
    }
    res.setHeader('Content-Type', 'text/plain');
    res.send(buf);
  } catch (error) {
    const err = error as Error;
    log.error(`Failed to get YouTube cookies: ${err.message}`);
    res.status(500).json({ error: 'Failed to retrieve cookies' });
  }
});

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

router.post('/play', async (req: Request, res: Response) => {
  if (!requireWorkerSecret(req, res)) return;
  const { guildId, source, userId, username } = req.body;
  if (!guildId || !source || !userId) {
    res.status(400).json({ error: 'Missing required fields' });
    return;
  }
  try {
    const multiBot = getMultiBotService();
    const result = await multiBot.playSound(guildId, source, userId, 'voice', username);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

router.post('/skip', async (req: Request, res: Response) => {
  if (!requireWorkerSecret(req, res)) return;
  const { guildId, count } = req.body;
  if (!guildId) {
    res.status(400).json({ error: 'Missing guildId' });
    return;
  }
  try {
    const multiBot = getMultiBotService();
    const skipped = await multiBot.skip(guildId, count || 1);
    res.json({ success: true, skipped });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

router.post('/pause', async (req: Request, res: Response) => {
  if (!requireWorkerSecret(req, res)) return;
  const { guildId } = req.body;
  if (!guildId) {
    res.status(400).json({ error: 'Missing guildId' });
    return;
  }
  try {
    const multiBot = getMultiBotService();
    const result = await multiBot.togglePause(guildId);
    res.json({ success: true, paused: result.paused });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

router.post('/resume', async (req: Request, res: Response) => {
  if (!requireWorkerSecret(req, res)) return;
  const { guildId } = req.body;
  if (!guildId) {
    res.status(400).json({ error: 'Missing guildId' });
    return;
  }
  try {
    const multiBot = getMultiBotService();
    // togglePause handles both pause and resume
    const result = await multiBot.togglePause(guildId);
    res.json({ success: true, paused: result.paused });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

router.post('/stop', async (req: Request, res: Response) => {
  if (!requireWorkerSecret(req, res)) return;
  const { guildId } = req.body;
  if (!guildId) {
    res.status(400).json({ error: 'Missing guildId' });
    return;
  }
  try {
    const multiBot = getMultiBotService();
    const success = await multiBot.stop(guildId);
    res.json({ success });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

router.post('/volume', async (req: Request, res: Response) => {
  if (!requireWorkerSecret(req, res)) return;
  const { guildId, volume, botType } = req.body;
  if (!guildId || volume === undefined) {
    res.status(400).json({ error: 'Missing required fields' });
    return;
  }
  try {
    const multiBot = getMultiBotService();
    const result = await multiBot.setVolume(guildId, volume, botType || 'rainbot');
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

router.post('/clear', async (req: Request, res: Response) => {
  if (!requireWorkerSecret(req, res)) return;
  const { guildId } = req.body;
  if (!guildId) {
    res.status(400).json({ error: 'Missing guildId' });
    return;
  }
  try {
    const multiBot = getMultiBotService();
    const result = await multiBot.clearQueue(guildId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

router.post('/playback-status', async (req: Request, res: Response) => {
  if (!requireWorkerSecret(req, res)) return;
  const { guildId } = req.body;
  if (!guildId) {
    res.status(400).json({ error: 'Missing guildId' });
    return;
  }
  try {
    const multiBot = getMultiBotService();
    const status = await multiBot.getStatus(guildId);
    if (!status) {
      res.json({
        playback: { status: 'idle' },
        nowPlaying: null,
        queueLength: 0,
      });
      return;
    }
    const playback = status.playback ?? { status: 'idle' };
    const queue = status.queue ?? { queue: [] };
    res.json({
      playback: {
        status: playback.status,
        volume: playback.volume,
        error: playback.error,
        positionMs: playback.positionMs,
        durationMs: playback.durationMs,
      },
      nowPlaying: queue.nowPlaying?.title ?? null,
      queueLength: queue.queue?.length ?? 0,
    });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

export default router;
