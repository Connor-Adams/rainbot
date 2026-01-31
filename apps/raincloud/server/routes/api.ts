import express, { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { Readable } from 'stream';
import { spawn } from 'child_process';
import * as voiceManager from '@utils/voiceManager';
import * as storage from '@utils/storage';
import { query } from '@utils/database';
import { getClient } from '../client';
import { requireAuth } from '../middleware/auth';
import * as stats from '@utils/statistics';
import MultiBotService, { getMultiBotService } from '../../lib/multiBotService';
import type { GuildMember } from 'discord.js';
import type { SeekRequest } from '@rainbot/worker-protocol';

const router = express.Router();

// Audio content type mapping for sound preview
const AUDIO_CONTENT_TYPES: Record<string, string> = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  m4a: 'audio/mp4',
  webm: 'audio/webm',
  flac: 'audio/flac',
};

type SoundCustomization = {
  displayName?: string;
  emoji?: string;
};

type CustomizationRow = {
  sound_name: string;
  display_name: string | null;
  emoji: string | null;
};

function mapCustomizations(rows: CustomizationRow[]): Record<string, SoundCustomization> {
  const result: Record<string, SoundCustomization> = {};
  for (const row of rows) {
    result[row.sound_name] = {
      displayName: row.display_name || undefined,
      emoji: row.emoji || undefined,
    };
  }
  return result;
}

async function renameSoundCustomization(fromName: string, toName: string): Promise<void> {
  const result = await query(
    `UPDATE sound_customizations SET sound_name = $2, updated_at = NOW() WHERE sound_name = $1`,
    [fromName, toName]
  );
  if (!result) {
    throw new Error('Sound customizations unavailable');
  }
}

async function deleteSoundCustomization(name: string): Promise<void> {
  const result = await query(`DELETE FROM sound_customizations WHERE sound_name = $1`, [name]);
  if (!result) {
    throw new Error('Sound customizations unavailable');
  }
}

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function toOggName(filename: string): string {
  if (filename.toLowerCase().endsWith('.ogg')) return filename;
  const lastDot = filename.lastIndexOf('.');
  if (lastDot === -1) return `${filename}.ogg`;
  return `${filename.slice(0, lastDot)}.ogg`;
}

async function trimToOggOpus(input: Buffer, startMs: number, endMs: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const startSec = (startMs / 1000).toFixed(3);
    const endSec = (endMs / 1000).toFixed(3);
    const ffmpeg = spawn('ffmpeg', [
      '-hide_banner',
      '-loglevel',
      'error',
      '-ss',
      startSec,
      '-to',
      endSec,
      '-i',
      'pipe:0',
      '-c:a',
      'libopus',
      '-b:a',
      '96k',
      '-vbr',
      'on',
      '-f',
      'ogg',
      'pipe:1',
    ]);

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    ffmpeg.stdout.on('data', (chunk: Buffer) => stdoutChunks.push(chunk));
    ffmpeg.stderr.on('data', (chunk: Buffer) => stderrChunks.push(chunk));
    ffmpeg.on('error', (error) => reject(error));
    ffmpeg.on('close', (code) => {
      if (code === 0) {
        resolve(Buffer.concat(stdoutChunks));
      } else {
        const stderr = Buffer.concat(stderrChunks).toString('utf8');
        reject(new Error(stderr || `ffmpeg exited with code ${code}`));
      }
    });

    ffmpeg.stdin.write(input);
    ffmpeg.stdin.end();
  });
}

interface AuthUser {
  id: string | null;
  username: string | null;
  discriminator: string | null;
}

interface RequestWithGuildMember extends Request {
  guildMember?: GuildMember;
}

function getParamValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function getPlaybackService(): ReturnType<typeof getMultiBotService> | null {
  if (MultiBotService.isInitialized()) {
    return getMultiBotService();
  }
  return null;
}

function requireMultiBot(res: Response): ReturnType<typeof getMultiBotService> | null {
  const multiBot = getPlaybackService();
  if (!multiBot) {
    res.status(503).json({ error: 'Worker services unavailable' });
    return null;
  }
  return multiBot;
}

/**
 * Middleware to verify user is a member of the requested guild
 */
async function requireGuildMember(req: Request, res: Response, next: NextFunction): Promise<void> {
  const guildId =
    getParamValue(req.body?.guildId) ||
    getParamValue(req.params?.['guildId']) ||
    getParamValue(req.params?.['id']);
  if (!guildId) {
    next();
    return;
  }

  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const client = getClient();
  if (!client?.isReady()) {
    res.status(503).json({ error: 'Bot not ready' });
    return;
  }

  const guild = client.guilds.cache.get(guildId);
  if (!guild) {
    res.status(404).json({ error: 'Guild not found' });
    return;
  }

  try {
    const member = await guild.members.fetch(userId);
    if (!member) {
      res.status(403).json({ error: 'Not a member of this guild' });
      return;
    }
    (req as RequestWithGuildMember).guildMember = member;
    next();
  } catch {
    res.status(403).json({ error: 'Not a member of this guild' });
  }
}

function getAuthUser(req: Request): AuthUser {
  const user = req.user;
  if (!user) {
    return { id: null, username: null, discriminator: null };
  }
  return {
    id: user.id || null,
    username: user.username || null,
    discriminator: user.discriminator || null,
  };
}

function toPercent(volume?: number): number | undefined {
  if (volume === undefined || volume === null) return undefined;
  return volume <= 1 ? Math.round(volume * 100) : Math.round(volume);
}

const MAX_UPLOAD_FILES = 10;
const MAX_TOTAL_UPLOAD_BYTES = 200 * 1024 * 1024; // 200MB across all files

// Configure multer for file uploads
// Always use memory storage - files are uploaded to S3
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB max
    files: MAX_UPLOAD_FILES,
  },
  fileFilter: (_req, file, cb) => {
    const allowedTypes = /\.(mp3|wav|ogg|m4a|webm|flac)$/i;
    if (allowedTypes.test(file.originalname)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Allowed: mp3, wav, ogg, m4a, webm, flac'));
    }
  },
});

// GET /api/sounds - List all sounds
router.get('/sounds', requireAuth, async (_req, res: Response) => {
  try {
    const sounds = await voiceManager.listSounds();
    res.json(sounds);
  } catch (error) {
    const err = error as Error;
    res.status(500).json({ error: err.message });
  }
});

// GET /api/sounds/customizations - List all sound customizations
router.get('/sounds/customizations', requireAuth, async (_req, res: Response) => {
  const result = await query(
    `SELECT sound_name, display_name, emoji FROM sound_customizations ORDER BY sound_name`
  );
  if (!result) {
    res.status(503).json({ error: 'Sound customizations unavailable' });
    return;
  }

  res.json(mapCustomizations(result.rows as CustomizationRow[]));
});

// GET /api/recordings - List all voice recordings
router.get('/recordings', requireAuth, async (req, res: Response) => {
  try {
    const userId = req.query['userId'] as string | undefined;
    const recordings = await storage.listRecordings(userId);
    res.json(recordings);
  } catch (error) {
    const err = error as Error;
    res.status(500).json({ error: err.message });
  }
});

// GET /api/sounds/:name/download - Download a sound file
router.get('/sounds/:name/download', requireAuth, async (req, res: Response) => {
  try {
    const filename = getParamValue(req.params['name']);
    if (!filename) {
      res.status(400).json({ error: 'Sound name is required' });
      return;
    }
    const stream = await storage.getSoundStream(filename);

    // Set headers for download
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);

    stream.pipe(res);
  } catch (error) {
    const err = error as Error;
    res.status(404).json({ error: err.message });
  }
});

// GET /api/sounds/:name/preview - Stream a sound file for preview
router.get('/sounds/:name/preview', requireAuth, async (req, res: Response) => {
  try {
    const filename = getParamValue(req.params['name']);
    if (!filename) {
      res.status(400).json({ error: 'Sound name is required' });
      return;
    }
    const { stream, filename: resolvedName } = await storage.getSoundStreamWithName(filename);

    // Get the appropriate audio content type based on file extension
    const ext = resolvedName.split('.').pop()?.toLowerCase();
    const contentType = ext ? AUDIO_CONTENT_TYPES[ext] || 'audio/mpeg' : 'audio/mpeg';

    // Set headers for inline playback
    res.setHeader('Content-Type', contentType);
    res.setHeader('Accept-Ranges', 'bytes');

    stream.pipe(res);
  } catch (error) {
    const err = error as Error;
    res.status(404).json({ error: err.message });
  }
});

// POST /api/sounds - Upload one or more sounds
router.post(
  '/sounds',
  requireAuth,
  upload.array('sound', MAX_UPLOAD_FILES),
  async (req: Request, res: Response): Promise<void> => {
    const files = req.files as Express.Multer.File[] | undefined;
    if (!files || files.length === 0) {
      res.status(400).json({ error: 'No files uploaded' });
      return;
    }
    const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
    if (totalBytes > MAX_TOTAL_UPLOAD_BYTES) {
      res.status(413).json({ error: 'Total upload size exceeds 200MB' });
      return;
    }

    const results: Array<{ name: string; originalName: string; size: number }> = [];
    const errors: Array<{ originalName: string; error: string }> = [];

    for (const file of files) {
      try {
        // Upload to S3 storage
        const fileStream = Readable.from(file.buffer);
        const filename = await storage.uploadSound(fileStream, file.originalname);

        results.push({
          name: filename,
          originalName: file.originalname,
          size: file.size,
        });
      } catch (error) {
        const err = error as Error;
        errors.push({
          originalName: file.originalname,
          error: err.message,
        });
      }
    }

    if (results.length === 0) {
      res.status(500).json({
        error: 'All uploads failed',
        errors: errors,
      });
      return;
    }

    res.json({
      message: `Successfully uploaded ${results.length} file(s)${errors.length > 0 ? `, ${errors.length} failed` : ''}`,
      files: results,
      errors: errors.length > 0 ? errors : undefined,
    });
  }
);

// DELETE /api/sounds/:name - Delete a sound
router.delete('/sounds/:name', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const filename = getParamValue(req.params['name']);
    if (!filename) {
      res.status(400).json({ error: 'Sound name is required' });
      return;
    }
    await voiceManager.deleteSound(filename);
    try {
      await deleteSoundCustomization(filename);
    } catch {
      // Best-effort cleanup if DB is unavailable.
    }
    res.json({ message: 'Sound deleted successfully' });
  } catch (error) {
    const err = error as Error;
    res.status(404).json({ error: err.message });
  }
});

// PUT /api/sounds/:name/customization - Set display name/emoji for a sound
router.put(
  '/sounds/:name/customization',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const name = getParamValue(req.params['name']);
    if (!name) {
      res.status(400).json({ error: 'Sound name is required' });
      return;
    }

    const displayName =
      typeof req.body?.displayName === 'string' ? req.body.displayName.trim() : '';
    const emoji = typeof req.body?.emoji === 'string' ? req.body.emoji.trim() : '';

    if (!displayName && !emoji) {
      try {
        await deleteSoundCustomization(name);
        res.json({ deleted: true });
      } catch (error) {
        const err = error as Error;
        res.status(503).json({ error: err.message });
      }
      return;
    }

    const result = await query(
      `INSERT INTO sound_customizations (sound_name, display_name, emoji, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (sound_name)
       DO UPDATE SET display_name = EXCLUDED.display_name, emoji = EXCLUDED.emoji, updated_at = NOW()`,
      [name, displayName || null, emoji || null]
    );

    if (!result) {
      res.status(503).json({ error: 'Sound customizations unavailable' });
      return;
    }

    res.json({ soundName: name, displayName: displayName || null, emoji: emoji || null });
  }
);

// DELETE /api/sounds/:name/customization - Remove customization
router.delete(
  '/sounds/:name/customization',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const name = getParamValue(req.params['name']);
    if (!name) {
      res.status(400).json({ error: 'Sound name is required' });
      return;
    }

    try {
      await deleteSoundCustomization(name);
      res.json({ deleted: true });
    } catch (error) {
      const err = error as Error;
      res.status(503).json({ error: err.message });
    }
  }
);

// POST /api/sounds/transcode-sweep - Convert all sounds to Ogg Opus
router.post(
  '/sounds/transcode-sweep',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const deleteOriginal = req.body?.deleteOriginal === true;
      const limit = Number(req.body?.limit || 0);
      const result = await storage.sweepTranscodeSounds({
        deleteOriginal,
        limit: Number.isFinite(limit) ? limit : 0,
      });
      res.json(result);
    } catch (error) {
      const err = error as Error;
      res.status(500).json({ error: err.message });
    }
  }
);

// POST /api/sounds/:name/trim - Trim a sound (start/end in ms)
router.post(
  '/sounds/:name/trim',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const rawName = getParamValue(req.params['name']) || '';
    const name = decodeURIComponent(rawName);
    const startMs = Number(req.body?.startMs);
    const endMs = Number(req.body?.endMs);

    if (!name) {
      res.status(400).json({ error: 'sound name is required' });
      return;
    }

    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs < 0 || endMs <= startMs) {
      res.status(400).json({ error: 'startMs/endMs must be valid and endMs > startMs' });
      return;
    }

    try {
      const stream = await storage.getSoundStream(name);
      const buffer = await streamToBuffer(stream);
      const trimmed = await trimToOggOpus(buffer, startMs, endMs);
      const targetName = toOggName(name);

      const trimmedStream = (async function* () {
        yield trimmed;
      })();

      const uploadedName = await storage.uploadSound(trimmedStream, targetName);

      if (uploadedName !== name) {
        try {
          await storage.deleteSound(name);
        } catch (error) {
          const err = error as Error;
          console.warn(`Failed to delete original sound ${name}: ${err.message}`);
        }
        try {
          await renameSoundCustomization(name, uploadedName);
        } catch {
          // Best-effort rename if DB is unavailable.
        }
      }

      res.json({ name: uploadedName });
    } catch (error) {
      const err = error as Error;
      res.status(500).json({ error: err.message });
    }
  }
);

// POST /api/play - Play a sound
router.post(
  '/play',
  requireAuth,
  requireGuildMember,
  async (req: Request, res: Response): Promise<void> => {
    const { guildId, source } = req.body;

    if (!guildId || !source) {
      res.status(400).json({ error: 'guildId and source are required' });
      return;
    }

    try {
      const { id: userId, username, discriminator } = getAuthUser(req);
      const effectiveUserId = userId || 'unknown';
      const effectiveUsername = username || undefined;
      const multiBot = requireMultiBot(res);
      if (!multiBot) return;

      const result = await multiBot.playSound(
        guildId,
        source,
        effectiveUserId,
        'api',
        effectiveUsername
      );
      if (!result.success) {
        throw new Error(result.message || result.error || 'Play failed');
      }

      if (userId) {
        stats.trackCommand('play', userId, guildId, 'api', true, null, username, discriminator);
      }

      res.json({
        message: result.playedAsSoundboard ? 'Playing soundboard' : 'Playing',
        position: result.position ?? null,
        playedAsSoundboard: result.playedAsSoundboard ?? false,
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
      res.status(400).json({ error: err.message });
    }
  }
);

// POST /api/soundboard - Play a soundboard sound with overlay (ducks music)
router.post(
  '/soundboard',
  requireAuth,
  requireGuildMember,
  async (req: Request, res: Response): Promise<void> => {
    const { guildId, sound } = req.body;

    if (!guildId || !sound) {
      res.status(400).json({ error: 'guildId and sound are required' });
      return;
    }

    try {
      const { id: userId, username, discriminator } = getAuthUser(req);
      const effectiveUserId = userId || 'unknown';
      const multiBot = requireMultiBot(res);
      if (!multiBot) return;

      const result = await multiBot.playSoundboard(guildId, effectiveUserId, sound);
      if (!result.success) {
        throw new Error(result.message || 'Soundboard failed');
      }

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
      const err = error as Error;
      const { id: userId, username, discriminator } = getAuthUser(req);
      if (userId) {
        stats.trackCommand(
          'soundboard',
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

// POST /api/stop - Stop playback
router.post(
  '/stop',
  requireAuth,
  requireGuildMember,
  async (req: Request, res: Response): Promise<void> => {
    const { guildId } = req.body;

    if (!guildId) {
      res.status(400).json({ error: 'guildId is required' });
      return;
    }

    const { id: userId, username, discriminator } = getAuthUser(req);
    const multiBot = requireMultiBot(res);
    if (!multiBot) return;
    const stopped = await multiBot.stop(guildId);
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
      res.status(400).json({ error: 'Not playing anything' });
    }
  }
);

// POST /api/skip - Skip to next track
router.post(
  '/skip',
  requireAuth,
  requireGuildMember,
  async (req: Request, res: Response): Promise<void> => {
    const { guildId } = req.body;

    if (!guildId) {
      res.status(400).json({ error: 'guildId is required' });
      return;
    }

    try {
      const { id: userId, username, discriminator } = getAuthUser(req);
      const multiBot = requireMultiBot(res);
      if (!multiBot) return;
      const skipped = await multiBot.skip(guildId, 1);
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
        res.status(400).json({ error: 'No track to skip' });
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
      res.status(400).json({ error: err.message });
    }
  }
);

// POST /api/replay - Replay the last played track
router.post(
  '/replay',
  requireAuth,
  requireGuildMember,
  async (req: Request, res: Response): Promise<void> => {
    const { guildId } = req.body;

    if (!guildId) {
      res.status(400).json({ error: 'guildId is required' });
      return;
    }

    try {
      const { id: userId, username, discriminator } = getAuthUser(req);
      const multiBot = requireMultiBot(res);
      if (!multiBot) return;

      const result = await multiBot.replay(guildId);
      if (result.success && result.track) {
        if (userId) {
          stats.trackCommand('replay', userId, guildId, 'api', true, null, username, discriminator);
        }
        res.json({ message: `Replaying: ${result.track}`, track: result.track });
        return;
      }
      res.status(400).json({ error: result.message || 'No track to replay' });
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
      res.status(400).json({ error: err.message });
    }
  }
);

// POST /api/pause - Toggle pause/resume
router.post(
  '/pause',
  requireAuth,
  requireGuildMember,
  async (req: Request, res: Response): Promise<void> => {
    const { guildId } = req.body;

    if (!guildId) {
      res.status(400).json({ error: 'guildId is required' });
      return;
    }

    try {
      const { id: userId, username, discriminator } = getAuthUser(req);
      const multiBot = requireMultiBot(res);
      if (!multiBot) return;
      const paused = (await multiBot.togglePause(guildId)).paused;

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
      res.status(400).json({ error: err.message });
    }
  }
);

/** Request body for POST /api/seek (canonical: Pick<SeekRequest, 'guildId' | 'positionSeconds'>) */
type SeekRequestBody = Pick<SeekRequest, 'guildId' | 'positionSeconds'>;

// POST /api/seek - Seek to position (seconds)
router.post(
  '/seek',
  requireAuth,
  requireGuildMember,
  async (req: Request, res: Response): Promise<void> => {
    const body = req.body as Partial<SeekRequestBody>;
    const guildId = body.guildId;
    const positionSeconds = body.positionSeconds;

    if (!guildId) {
      res.status(400).json({ error: 'guildId is required' });
      return;
    }
    const pos =
      typeof positionSeconds === 'number'
        ? positionSeconds
        : typeof positionSeconds === 'string'
          ? parseFloat(positionSeconds)
          : NaN;
    if (Number.isNaN(pos) || pos < 0) {
      res.status(400).json({ error: 'positionSeconds must be a non-negative number' });
      return;
    }

    try {
      const multiBot = requireMultiBot(res);
      if (!multiBot) return;
      const result = await multiBot.seek(guildId, pos);
      if (result.success) {
        res.json({ message: 'Seeked', positionSeconds: Math.floor(pos) });
      } else {
        res.status(400).json({ error: result.message || 'Seek failed' });
      }
    } catch (error) {
      const err = error as Error;
      res.status(400).json({ error: err.message });
    }
  }
);

// POST /api/volume - Set volume
router.post(
  '/volume',
  requireAuth,
  requireGuildMember,
  async (req: Request, res: Response): Promise<void> => {
    const { guildId, level, botType } = req.body;

    if (!guildId) {
      res.status(400).json({ error: 'guildId is required' });
      return;
    }

    if (level === undefined || level === null) {
      res.status(400).json({ error: 'level is required (1-100)' });
      return;
    }
    if (botType && !['rainbot', 'pranjeet', 'hungerbot'].includes(botType)) {
      res.status(400).json({ error: 'botType must be rainbot, pranjeet, or hungerbot' });
      return;
    }

    try {
      const { id: userId, username, discriminator } = getAuthUser(req);
      const multiBot = requireMultiBot(res);
      if (!multiBot) return;
      let volume = level;
      if (botType) {
        const result = await multiBot.setVolume(guildId, level, botType);
        if (!result.success) {
          throw new Error(result.message || 'Failed to set volume');
        }
      } else {
        const rainbotResult = await multiBot.setVolume(guildId, level, 'rainbot');
        if (!rainbotResult.success) {
          throw new Error(rainbotResult.message || 'Failed to set volume');
        }
        // Best-effort: keep soundboard volume in sync with music volume.
        await multiBot.setVolume(guildId, level, 'hungerbot');
      }

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
      res.status(400).json({ error: err.message });
    }
  }
);

// GET /api/status - Get bot status
router.get('/status', requireAuth, async (_req, res: Response): Promise<void> => {
  const client = getClient();

  if (!client || !client.isReady()) {
    res.json({
      online: false,
      guilds: [],
      connections: [],
    });
    return;
  }

  const guilds = client.guilds.cache.map((guild) => ({
    id: guild.id,
    name: guild.name,
    memberCount: guild.memberCount,
  }));

  const multiBot = getPlaybackService();
  if (multiBot) {
    const statusResults = await Promise.all(guilds.map((guild) => multiBot.getStatus(guild.id)));
    const connections = statusResults
      .map((status, index) => {
        if (!status) return null;
        const workers = status.workers;
        return {
          guildId: guilds[index]?.id,
          channelId: status.channelId,
          channelName: status.channelName,
          isPlaying: status.playback.status === 'playing',
          volume: toPercent(status.playback.volume),
          workers: workers
            ? (() => {
                const rainbot = workers['rainbot'];
                const pranjeet = workers['pranjeet'];
                const hungerbot = workers['hungerbot'];
                return {
                  rainbot: {
                    ...rainbot,
                    volume: toPercent(rainbot?.playback?.volume),
                  },
                  pranjeet: {
                    ...pranjeet,
                    volume: toPercent(pranjeet?.playback?.volume),
                  },
                  hungerbot: {
                    ...hungerbot,
                    volume: toPercent(hungerbot?.playback?.volume),
                  },
                };
              })()
            : workers,
        };
      })
      .filter((entry) => entry !== null);

    res.json({
      online: true,
      username: client.user.username,
      discriminator: client.user.discriminator,
      guilds,
      connections,
    });
    return;
  }

  res.json({
    online: true,
    username: client.user.username,
    discriminator: client.user.discriminator,
    guilds,
    connections: [],
    workersUnavailable: true,
  });
});

// GET /api/guilds/:id/channels - Get voice channels for a guild
router.get('/guilds/:id/channels', requireAuth, requireGuildMember, (req, res: Response): void => {
  const client = getClient();

  if (!client || !client.isReady()) {
    res.status(503).json({ error: 'Bot not ready' });
    return;
  }

  const guildId = getParamValue(req.params['id']);
  if (!guildId) {
    res.status(400).json({ error: 'Guild id is required' });
    return;
  }
  const guild = client.guilds.cache.get(guildId);
  if (!guild) {
    res.status(404).json({ error: 'Guild not found' });
    return;
  }

  const voiceChannels = guild.channels.cache
    .filter((channel) => channel.type === 2) // 2 = GuildVoice
    .map((channel) => ({
      id: channel.id,
      name: channel.name,
    }));

  res.json(voiceChannels);
});

// GET /api/queue/:guildId - Get queue for a guild
router.get(
  '/queue/:guildId',
  requireAuth,
  requireGuildMember,
  async (req: Request, res: Response): Promise<void> => {
    const guildId = getParamValue(req.params['guildId']);
    if (!guildId) {
      res.status(400).json({ error: 'guildId is required' });
      return;
    }

    try {
      const multiBot = requireMultiBot(res);
      if (!multiBot) return;
      const queue = await multiBot.getQueue(guildId);
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
    const guildId = getParamValue(req.params['guildId']);
    if (!guildId) {
      res.status(400).json({ error: 'guildId is required' });
      return;
    }

    try {
      const { id: userId, username, discriminator } = getAuthUser(req);
      const multiBot = requireMultiBot(res);
      if (!multiBot) return;
      const clearedResult = await multiBot.clearQueue(guildId);

      if (!clearedResult.success) {
        throw new Error(clearedResult.message || 'Failed to clear queue');
      }
      const cleared = clearedResult.cleared ?? 0;

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
    const guildId = getParamValue(req.params['guildId']);
    const index = getParamValue(req.params['index']);
    if (!guildId || !index) {
      res.status(400).json({ error: 'guildId and index are required' });
      return;
    }
    const trackIndex = parseInt(index);

    if (isNaN(trackIndex) || trackIndex < 0) {
      res.status(400).json({ error: 'Invalid index' });
      return;
    }

    try {
      const multiBot = getPlaybackService();
      if (multiBot) {
        res.status(501).json({ error: 'Remove track not supported in multi-bot mode yet' });
        return;
      }

      res.status(503).json({ error: 'Worker services unavailable' });
      return;
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

// POST /api/track/event - Track web events (page views, clicks, etc.)
router.post('/track/event', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { eventType, eventTarget, eventValue, guildId, durationMs, webSessionId } = req.body;

  if (!eventType) {
    res.status(400).json({ error: 'eventType is required' });
    return;
  }

  const { id: userId } = getAuthUser(req);
  if (!userId) {
    res.status(401).json({ error: 'Authentication required' });
    return;
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
});

// POST /api/track/batch - Track multiple web events at once
router.post('/track/batch', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { events } = req.body;

  if (!events || !Array.isArray(events)) {
    res.status(400).json({ error: 'events array is required' });
    return;
  }

  const { id: userId } = getAuthUser(req);
  if (!userId) {
    res.status(401).json({ error: 'Authentication required' });
    return;
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
});

// Error handling for multer
router.use((error: Error, _req: Request, res: Response, _next: NextFunction): void => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      res.status(400).json({ error: 'File too large. Max size is 50MB.' });
      return;
    }
  }
  res.status(400).json({ error: error.message });
});

export default router;
