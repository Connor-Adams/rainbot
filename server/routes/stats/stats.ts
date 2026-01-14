import express, { Request, Response } from 'express';
import { query } from '../../../utils/database';
import { requireAuth } from '../../middleware/auth';
import { statsEmitter } from '../../../utils/statistics';
import rateLimit from 'express-rate-limit';
import { asyncHandler, statsErrorHandler } from '../../middleware/errorHandler';
import { parseFilters, parseLimit, ValidationError } from '../../utils/validators';
import { StatsService } from './statsService';

const router = express.Router();
const statsService = new StatsService();

const statsRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  message: { error: 'Too many requests from this IP, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ============================================================================
// ROUTES - All using service layer pattern
// ============================================================================

// GET /api/stats/summary - Overall summary
router.get(
  '/summary',
  statsRateLimiter,
  requireAuth,
  asyncHandler(async (req, res) => {
    const filters = parseFilters(req.query);
    const summary = await statsService.getSummary(filters);
    res.json(summary);
  })
);

// GET /api/stats/commands - Command usage stats
router.get(
  '/commands',
  statsRateLimiter,
  requireAuth,
  asyncHandler(async (req, res) => {
    const filters = parseFilters(req.query);
    const limit = parseLimit(req.query.limit as string);
    const stats = await statsService.getCommandStats(filters, limit);
    res.json(stats);
  })
);

// GET /api/stats/sounds - Sound playback stats
router.get(
  '/sounds',
  statsRateLimiter,
  requireAuth,
  asyncHandler(async (req, res) => {
    const filters = parseFilters(req.query);
    const limit = parseLimit(req.query.limit as string);
    const stats = await statsService.getSoundStats(filters, limit);
    res.json(stats);
  })
);

// GET /api/stats/users - User activity stats
router.get(
  '/users',
  statsRateLimiter,
  requireAuth,
  asyncHandler(async (req, res) => {
    const filters = parseFilters(req.query);
    const limit = parseLimit(req.query.limit as string);
    const stats = await statsService.getUserStats(filters, limit);
    res.json(stats);
  })
);

// GET /api/stats/user-sounds - Which sounds a specific user played
router.get(
  '/user-sounds',
  statsRateLimiter,
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.query.userId as string;
    if (!userId) {
      throw new ValidationError('Missing required query parameter: userId');
    }
    const filters = parseFilters(req.query);
    const limit = parseLimit(req.query.limit as string, 50, 200);
    const stats = await statsService.getUserSounds(userId, filters, limit);
    res.json(stats);
  })
);

// Export handler for backward compatibility if needed elsewhere
export async function getUserSoundsHandler(req: Request, res: Response): Promise<void> {
  const userId = req.query.userId as string;
  if (!userId) {
    res.status(400).json({ error: 'Missing required query parameter: userId' });
    return;
  }
  const filters = parseFilters(req.query);
  const limit = parseLimit(req.query.limit as string, 50, 200);
  const stats = await statsService.getUserSounds(userId, filters, limit);
  res.json(stats);
}

// GET /api/stats/guilds - Guild activity stats
router.get(
  '/guilds',
  statsRateLimiter,
  requireAuth,
  asyncHandler(async (req, res) => {
    const filters = parseFilters(req.query);
    const limit = parseLimit(req.query.limit as string);
    const stats = await statsService.getGuildStats(filters, limit);
    res.json(stats);
  })
);

// GET /api/stats/time - Time-based trends
router.get(
  '/time',
  statsRateLimiter,
  requireAuth,
  asyncHandler(async (req, res) => {
    const granularity = (req.query.granularity as string) || 'day';
    const filters = parseFilters(req.query);
    const stats = await statsService.getTimeStats(granularity, filters);
    res.json(stats);
  })
);

// GET /api/stats/queue - Queue operation stats
router.get(
  '/queue',
  statsRateLimiter,
  requireAuth,
  asyncHandler(async (req, res) => {
    const filters = parseFilters(req.query);
    const limit = parseLimit(req.query.limit as string);
    const stats = await statsService.getQueueStats(filters, limit);
    res.json(stats);
  })
);

// GET /api/stats/history - Get listening history
router.get(
  '/history',
  statsRateLimiter,
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = (req.query.userId as string) || null;
    const guildId = (req.query.guildId as string) || null;
    const limit = parseLimit(req.query.limit as string);
    const filters = parseFilters(req.query);

    const listeningHistory = require('../../utils/listeningHistory');
    const history = await listeningHistory.getListeningHistory(
      userId,
      guildId,
      limit,
      filters.startDate,
      filters.endDate
    );

    res.json({
      history: history || [],
      count: history?.length || 0,
    });
  })
);

// GET /api/stats/errors - Error breakdown by type and command
router.get(
  '/errors',
  statsRateLimiter,
  requireAuth,
  asyncHandler(async (req, res) => {
    const filters = parseFilters(req.query);
    const stats = await statsService.getErrorStats(filters);
    res.json(stats);
  })
);

// GET /api/stats/performance - Command execution time percentiles
router.get(
  '/performance',
  statsRateLimiter,
  requireAuth,
  asyncHandler(async (req, res) => {
    const filters = parseFilters(req.query);
    const stats = await statsService.getPerformanceStats(filters);
    res.json(stats);
  })
);

// GET /api/stats/sessions - Voice session analytics
router.get(
  '/sessions',
  statsRateLimiter,
  requireAuth,
  asyncHandler(async (req, res) => {
    const filters = parseFilters(req.query);
    const limit = parseLimit(req.query.limit as string);
    const stats = await statsService.getSessionStats(filters, limit);
    res.json(stats);
  })
);

// GET /api/stats/retention - User retention and cohort analysis
router.get(
  '/retention',
  statsRateLimiter,
  requireAuth,
  asyncHandler(async (req, res) => {
    const guildId = req.query.guildId as string | undefined;
    const stats = await statsService.getRetentionStats(guildId);
    res.json(stats);
  })
);

// GET /api/stats/search - Search query analytics
router.get(
  '/search',
  statsRateLimiter,
  requireAuth,
  asyncHandler(async (req, res) => {
    const filters = parseFilters(req.query);
    const limit = parseLimit(req.query.limit as string);
    const stats = await statsService.getSearchStats(filters, limit);
    res.json(stats);
  })
);

// GET /api/stats/user-sessions - User voice session analytics
router.get(
  '/user-sessions',
  statsRateLimiter,
  requireAuth,
  asyncHandler(async (req, res) => {
    const filters = parseFilters(req.query);
    const limit = parseLimit(req.query.limit as string);
    const stats = await statsService.getUserSessionStats(filters, limit);
    res.json(stats);
  })
);

// GET /api/stats/user-tracks - User track listening analytics
router.get(
  '/user-tracks',
  statsRateLimiter,
  requireAuth,
  asyncHandler(async (req, res) => {
    const filters = parseFilters(req.query);
    const limit = parseLimit(req.query.limit as string);
    const stats = await statsService.getUserTrackStats(filters, limit);
    res.json(stats);
  })
);

// GET /api/stats/user/:userId - Individual user statistics
router.get(
  '/user/:userId',
  statsRateLimiter,
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.params.userId;
    if (!userId) {
      throw new ValidationError('userId is required');
    }
    const guildId = req.query.guildId as string | undefined;
    const stats = await statsService.getUserDetails(userId, guildId);
    res.json(stats);
  })
);

// GET /api/stats/engagement - Track engagement analytics
router.get(
  '/engagement',
  statsRateLimiter,
  requireAuth,
  asyncHandler(async (req, res) => {
    const filters = parseFilters(req.query);
    const limit = parseLimit(req.query.limit as string);
    const stats = await statsService.getEngagementStats(filters, limit);
    res.json(stats);
  })
);

// GET /api/stats/interactions - Interaction events
router.get(
  '/interactions',
  statsRateLimiter,
  requireAuth,
  asyncHandler(async (req, res) => {
    const filters = parseFilters(req.query);
    const limit = parseLimit(req.query.limit as string);
    const stats = await statsService.getInteractionStats(filters, limit);
    res.json(stats);
  })
);

// GET /api/stats/playback-states - Playback state changes
router.get(
  '/playback-states',
  statsRateLimiter,
  requireAuth,
  asyncHandler(async (req, res) => {
    const filters = parseFilters(req.query);
    const stats = await statsService.getPlaybackStateStats(filters);
    res.json(stats);
  })
);

// GET /api/stats/web-analytics - Web dashboard usage analytics
router.get(
  '/web-analytics',
  statsRateLimiter,
  requireAuth,
  asyncHandler(async (req, res) => {
    const filters = parseFilters(req.query);
    const limit = parseLimit(req.query.limit as string);
    const stats = await statsService.getWebAnalytics(filters, limit);
    res.json(stats);
  })
);

// GET /api/stats/guild-events - Guild join/leave events
router.get(
  '/guild-events',
  statsRateLimiter,
  requireAuth,
  asyncHandler(async (req, res) => {
    const filters = parseFilters(req.query);
    const limit = parseLimit(req.query.limit as string);
    const stats = await statsService.getGuildEvents(filters, limit);
    res.json(stats);
  })
);

// GET /api/stats/api-latency - API performance metrics
router.get(
  '/api-latency',
  statsRateLimiter,
  requireAuth,
  asyncHandler(async (req, res) => {
    const filters = parseFilters(req.query);
    const stats = await statsService.getApiLatencyStats(filters);
    res.json(stats);
  })
);

// GET /api/stats/stream - Server-Sent Events stream for stats updates
router.get('/stream', statsRateLimiter, requireAuth, (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders && res.flushHeaders();

  const send = (event: string, data: unknown) => {
    try {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch {
      // ignore write errors
    }
  };

  const onBatch = (payload: unknown) => send('stats-update', payload);
  const onFlush = (payload: unknown) => send('stats-flushed', payload);

  statsEmitter.on('batchInserted', onBatch);
  statsEmitter.on('flushed', onFlush);

  send('connected', { ts: new Date().toISOString() });

  req.on('close', () => {
    statsEmitter.off('batchInserted', onBatch);
    statsEmitter.off('flushed', onFlush);
    try {
      res.end();
    } catch {
      // no-op
    }
  });
});

// GET /api/stats/check-tables - Quick diagnostic
router.get(
  '/check-tables',
  statsRateLimiter,
  requireAuth,
  asyncHandler(async (_req, res) => {
    const tables = [
      'command_stats',
      'sound_stats',
      'queue_operations',
      'voice_events',
      'search_stats',
      'user_voice_sessions',
      'user_track_listens',
      'track_engagement',
      'interaction_events',
      'playback_state_changes',
      'web_events',
      'guild_events',
      'api_latency',
    ];

    const counts: Record<string, number> = {};
    for (const t of tables) {
      try {
        const r = await query(`SELECT COUNT(*) as count FROM ${t}`);
        counts[t] = parseInt(r?.rows[0]?.count || '0');
      } catch {
        counts[t] = -1;
      }
    }

    res.json({ tables: counts, ts: new Date().toISOString() });
  })
);

// ============================================================================
// ERROR HANDLER - Must be last
// ============================================================================

router.use(statsErrorHandler);

export default router;
