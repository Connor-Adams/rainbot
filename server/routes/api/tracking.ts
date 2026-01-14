import express, { Request, Response } from 'express';
import { requireAuth } from '../../middleware/auth';
import { asyncHandler, HttpError } from '../../middleware/errorHandler';
import * as stats from '../../../utils/statistics';
import { getAuthUser } from './shared';

const router = express.Router();

// POST /api/track/event - Track web events (page views, clicks, etc.)
router.post(
  '/track/event',
  requireAuth,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { eventType, eventTarget, eventValue, guildId, durationMs, webSessionId } = req.body;

    if (!eventType) {
      throw new HttpError(400, 'eventType is required');
    }

    const { id: userId } = getAuthUser(req);
    if (!userId) {
      throw new HttpError(401, 'Authentication required');
    }

    stats.trackWebEvent(
      userId,
      eventType,
      eventTarget || null,
      eventValue || null,
      guildId || null,
      durationMs || null,
      webSessionId || null
    );

    res.json({ success: true });
  })
);

// POST /api/track/batch - Track multiple web events at once
router.post(
  '/track/batch',
  requireAuth,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { events } = req.body;

    if (!events || !Array.isArray(events)) {
      throw new HttpError(400, 'events array is required');
    }

    const { id: userId } = getAuthUser(req);
    if (!userId) {
      throw new HttpError(401, 'Authentication required');
    }

    for (const event of events) {
      stats.trackWebEvent(
        userId,
        event.eventType,
        event.eventTarget || null,
        event.eventValue || null,
        event.guildId || null,
        event.durationMs || null,
        event.webSessionId || null
      );
    }

    res.json({ success: true, tracked: events.length });
  })
);

export default router;
