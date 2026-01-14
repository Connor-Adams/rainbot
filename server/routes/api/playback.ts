import express, { Request, Response } from 'express';
import * as voiceManager from '../../../utils/voiceManager';
import { requireAuth } from '../../middleware/auth';
import { asyncHandler, HttpError } from '../../middleware/errorHandler';
import * as stats from '../../../utils/statistics';
import { getAuthUser, requireGuildMember, toHttpError } from './shared';

const router = express.Router();

// POST /api/play - Play a sound
router.post(
  '/play',
  requireAuth,
  requireGuildMember,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { guildId, source } = req.body;

    if (!guildId || !source) {
      throw new HttpError(400, 'guildId and source are required');
    }

    try {
      const { id: userId, username, discriminator } = getAuthUser(req);
      // Pass 'api' as source indicator
      const result = await voiceManager.playSound(
        guildId,
        source,
        userId,
        'api',
        username,
        discriminator
      );

      // Extract title from first track
      const firstTrack = result.tracks?.[0];
      const title = firstTrack ? firstTrack.title : 'Unknown';

      // Track API command
      if (userId) {
        stats.trackCommand('play', userId, guildId, 'api', true, null, username, discriminator);
      }

      // Sanitize tracks array to remove stream objects (which have circular references)
      const sanitizedTracks = result.tracks
        ? result.tracks.map(
            (track: { title: string; url?: string; duration?: number; isLocal?: boolean }) => ({
              title: track.title,
              url: track.url,
              duration: track.duration,
              isLocal: track.isLocal,
              // Explicitly exclude 'source' and 'isStream' to avoid circular references
            })
          )
        : [];

      res.json({
        message: 'Playing',
        title,
        added: result.added,
        totalInQueue: result.totalInQueue,
        tracks: sanitizedTracks,
      });
    } catch (error) {
      const err = error as Error;
      const { id: userId, username, discriminator } = getAuthUser(req);
      if (userId) {
        stats.trackCommand(
          'play',
          userId,
          guildId,
          'api',
          false,
          err.message,
          username,
          discriminator
        );
      }
      throw toHttpError(error, 400);
    }
  })
);

// POST /api/soundboard - Play a soundboard sound with overlay (ducks music)
router.post(
  '/soundboard',
  requireAuth,
  requireGuildMember,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { guildId, sound } = req.body;

    if (!guildId || !sound) {
      throw new HttpError(400, 'guildId and sound are required');
    }

    try {
      const { id: userId, username, discriminator } = getAuthUser(req);
      const result = await voiceManager.playSoundboardOverlay(
        guildId,
        sound,
        userId,
        'api',
        username,
        discriminator
      );

      // Track API command
      if (userId) {
        stats.trackCommand(
          'soundboard',
          userId,
          guildId,
          'api',
          true,
          null,
          username,
          discriminator
        );
      }

      res.json(result);
    } catch (error) {
      const { id: userId, username, discriminator } = getAuthUser(req);
      if (userId) {
        stats.trackCommand(
          'soundboard',
          userId,
          guildId,
          'api',
          false,
          error instanceof Error ? error.message : 'Unknown error',
          username,
          discriminator
        );
      }
      throw toHttpError(error, 400);
    }
  })
);

// POST /api/stop - Stop playback
router.post(
  '/stop',
  requireAuth,
  requireGuildMember,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { guildId } = req.body;

    if (!guildId) {
      throw new HttpError(400, 'guildId is required');
    }

    const { id: userId, username, discriminator } = getAuthUser(req);
    const stopped = voiceManager.stopSound(guildId);
    if (stopped) {
      // Track stop as clear operation
      if (userId) {
        stats.trackCommand('stop', userId, guildId, 'api', true, null, username, discriminator);
        stats.trackQueueOperation('clear', userId, guildId, 'api', { cleared: 0 });
      }
      res.json({ message: 'Playback stopped' });
    } else {
      if (userId) {
        stats.trackCommand(
          'stop',
          userId,
          guildId,
          'api',
          false,
          'Not playing anything',
          username,
          discriminator
        );
      }
      throw new HttpError(400, 'Not playing anything');
    }
  })
);

// POST /api/skip - Skip to next track
router.post(
  '/skip',
  requireAuth,
  requireGuildMember,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { guildId } = req.body;

    if (!guildId) {
      throw new HttpError(400, 'guildId is required');
    }

    try {
      const { id: userId, username, discriminator } = getAuthUser(req);
      const skipped = await voiceManager.skip(guildId, 1, userId);
      if (skipped && skipped.length > 0) {
        // Track API command and queue operation
        if (userId) {
          stats.trackCommand('skip', userId, guildId, 'api', true, null, username, discriminator);
        }
        res.json({ message: `Skipped ${skipped.length} track(s)`, skipped });
      } else {
        if (userId) {
          stats.trackCommand(
            'skip',
            userId,
            guildId,
            'api',
            false,
            'No track to skip',
            username,
            discriminator
          );
        }
        throw new HttpError(400, 'No track to skip');
      }
    } catch (error) {
      const err = error as Error;
      const { id: userId, username, discriminator } = getAuthUser(req);
      if (userId) {
        stats.trackCommand(
          'skip',
          userId,
          guildId,
          'api',
          false,
          err.message,
          username,
          discriminator
        );
      }
      throw toHttpError(error, 400);
    }
  })
);

// POST /api/replay - Replay the last played track
router.post(
  '/replay',
  requireAuth,
  requireGuildMember,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { guildId } = req.body;

    if (!guildId) {
      throw new HttpError(400, 'guildId is required');
    }

    try {
      const { id: userId, username, discriminator } = getAuthUser(req);
      const result = await voiceManager.replay(guildId);
      if (result) {
        if (userId) {
          stats.trackCommand('replay', userId, guildId, 'api', true, null, username, discriminator);
        }
        res.json({ message: `Replaying: ${result.title}`, track: result.title });
      } else {
        throw new HttpError(400, 'No track to replay');
      }
    } catch (error) {
      const err = error as Error;
      const { id: userId, username, discriminator } = getAuthUser(req);
      if (userId) {
        stats.trackCommand(
          'replay',
          userId,
          guildId,
          'api',
          false,
          err.message,
          username,
          discriminator
        );
      }
      throw toHttpError(error, 400);
    }
  })
);

// POST /api/pause - Toggle pause/resume
router.post(
  '/pause',
  requireAuth,
  requireGuildMember,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { guildId } = req.body;

    if (!guildId) {
      throw new HttpError(400, 'guildId is required');
    }

    try {
      const { id: userId, username, discriminator } = getAuthUser(req);
      const paused = voiceManager.togglePause(guildId, userId, username);

      // Track API command
      if (userId) {
        stats.trackCommand('pause', userId, guildId, 'api', true, null, username, discriminator);
      }

      res.json({ message: paused ? 'Paused' : 'Resumed', paused });
    } catch (error) {
      const err = error as Error;
      const { id: userId, username, discriminator } = getAuthUser(req);
      if (userId) {
        stats.trackCommand(
          'pause',
          userId,
          guildId,
          'api',
          false,
          err.message,
          username,
          discriminator
        );
      }
      throw toHttpError(error, 400);
    }
  })
);

// POST /api/volume - Set volume
router.post(
  '/volume',
  requireAuth,
  requireGuildMember,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { guildId, level } = req.body;

    if (!guildId) {
      throw new HttpError(400, 'guildId is required');
    }

    if (level === undefined || level === null) {
      throw new HttpError(400, 'level is required (1-100)');
    }

    try {
      const { id: userId, username, discriminator } = getAuthUser(req);
      const volume = voiceManager.setVolume(guildId, level, userId, username);

      if (userId) {
        stats.trackCommand('volume', userId, guildId, 'api', true, null, username, discriminator);
      }

      res.json({ message: `Volume set to ${volume}%`, volume });
    } catch (error) {
      const err = error as Error;
      const { id: userId, username, discriminator } = getAuthUser(req);
      if (userId) {
        stats.trackCommand(
          'volume',
          userId,
          guildId,
          'api',
          false,
          err.message,
          username,
          discriminator
        );
      }
      throw toHttpError(error, 400);
    }
  })
);

export default router;
