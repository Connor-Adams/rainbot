import { Router } from 'https://deno.land/x/oak@v12.6.1/mod.ts';
import type { RainbotContext } from '../index-oak.ts';
import { requireAuth } from '../middleware/auth-oak.ts';
import { createLogger } from '../../utils/logger.ts';
import * as stats from '../../utils/statistics.ts';

const log = createLogger('API');

const router = new Router();

// Rate limiting middleware for Oak
function rateLimit(windowMs: number, max: number) {
  const requests = new Map<string, { count: number; resetTime: number }>();

  return async (ctx: RainbotContext, next: any) => {
    const key = ctx.request.ip;
    const now = Date.now();
    const windowData = requests.get(key);

    if (!windowData || now > windowData.resetTime) {
      requests.set(key, { count: 1, resetTime: now + windowMs });
    } else if (windowData.count >= max) {
      ctx.response.status = 429;
      ctx.response.body = { error: 'Too many requests' };
      return;
    } else {
      windowData.count++;
    }

    await next();
  };
}

const uploadRateLimiter = rateLimit(15 * 60 * 1000, 100); // 15 min, 100 requests

// GET /api/stats
router.get('/stats', requireAuth, async (ctx: RainbotContext) => {
  try {
    const statistics = await stats.getStatistics();
    ctx.response.status = 200;
    ctx.response.body = statistics;
  } catch (error) {
    log.error('Failed to get statistics:', error);
    ctx.response.status = 500;
    ctx.response.body = { error: 'Internal server error' };
  }
});

// GET /api/guilds/:guildId/stats
router.get('/guilds/:guildId/stats', requireAuth, async (ctx: RainbotContext) => {
  try {
    const { guildId } = ctx.params;
    const guildStats = await stats.getGuildStatistics(guildId);

    if (!guildStats) {
      ctx.response.status = 404;
      ctx.response.body = { error: 'Guild not found' };
      return;
    }

    ctx.response.status = 200;
    ctx.response.body = guildStats;
  } catch (error) {
    log.error('Failed to get guild statistics:', error);
    ctx.response.status = 500;
    ctx.response.body = { error: 'Internal server error' };
  }
});

// POST /api/sounds/upload
router.post('/sounds/upload', requireAuth, uploadRateLimiter, async (ctx: RainbotContext) => {
  try {
    const body = ctx.request.body();
    if (body.type !== 'form-data') {
      ctx.response.status = 400;
      ctx.response.body = { error: 'Expected form data' };
      return;
    }

    const formData = await body.formData();
    const file = formData.get('file') as File;
    const guildId = formData.get('guildId') as string;

    if (!file || !guildId) {
      ctx.response.status = 400;
      ctx.response.body = { error: 'Missing file or guildId' };
      return;
    }

    // Process file upload (similar to existing logic)
    // ... file processing code ...

    ctx.response.status = 201;
    ctx.response.body = { message: 'Sound uploaded successfully' };
  } catch (error) {
    log.error('Failed to upload sound:', error);
    ctx.response.status = 500;
    ctx.response.body = { error: 'Internal server error' };
  }
});

export default router;
