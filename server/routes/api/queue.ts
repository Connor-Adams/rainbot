import express, { Request, Response } from 'express';
import * as voiceManager from '../../../utils/voiceManager';
import { requireAuth } from '../../middleware/auth';
import * as stats from '../../../utils/statistics';
import { getAuthUser, requireGuildMember } from './shared';

const router = express.Router();

// GET /api/queue/:guildId - Get queue for a guild
router.get(
  '/queue/:guildId',
  requireAuth,
  requireGuildMember,
  async (req: Request, res: Response): Promise<void> => {
    const guildId = req.params['guildId']!;

    try {
      const queue = voiceManager.getQueue(guildId);
      res.json(queue);
    } catch (error) {
      const err = error as Error;
      res.status(400).json({ error: err.message });
    }
  }
);

// POST /api/queue/:guildId/clear - Clear the queue
router.post(
  '/queue/:guildId/clear',
  requireAuth,
  requireGuildMember,
  async (req: Request, res: Response): Promise<void> => {
    const guildId = req.params['guildId']!;

    try {
      const { id: userId, username, discriminator } = getAuthUser(req);
      const cleared = await voiceManager.clearQueue(guildId, userId);

      // Track API command
      if (userId) {
        stats.trackCommand('clear', userId, guildId, 'api', true, null, username, discriminator);
      }

      res.json({ message: `Cleared ${cleared} tracks`, cleared });
    } catch (error) {
      const err = error as Error;
      const { id: userId, username, discriminator } = getAuthUser(req);
      if (userId) {
        stats.trackCommand(
          'clear',
          userId,
          guildId,
          'api',
          false,
          err.message,
          username,
          discriminator
        );
      }
      res.status(400).json({ error: err.message });
    }
  }
);

// DELETE /api/queue/:guildId/:index - Remove a track from queue by index
router.delete(
  '/queue/:guildId/:index',
  requireAuth,
  requireGuildMember,
  async (req: Request, res: Response): Promise<void> => {
    const guildId = req.params['guildId']!;
    const index = req.params['index']!;
    const trackIndex = parseInt(index);

    if (isNaN(trackIndex) || trackIndex < 0) {
      res.status(400).json({ error: 'Invalid index' });
      return;
    }

    try {
      const { id: userId, username, discriminator } = getAuthUser(req);
      const removed = voiceManager.removeTrackFromQueue(guildId, trackIndex);

      // Track API command
      if (userId) {
        stats.trackCommand('remove', userId, guildId, 'api', true, null, username, discriminator);
      }

      res.json({ message: 'Track removed', track: removed });
    } catch (error) {
      const err = error as Error;
      const { id: userId, username, discriminator } = getAuthUser(req);
      if (userId) {
        stats.trackCommand(
          'remove',
          userId,
          guildId,
          'api',
          false,
          err.message,
          username,
          discriminator
        );
      }
      res.status(400).json({ error: err.message });
    }
  }
);

export default router;
