import express, { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { Readable } from 'stream';
import * as voiceManager from '../../../utils/voiceManager';
import * as storage from '../../../utils/storage';
import { requireAuth } from '../../middleware/auth';
import { asyncHandler, HttpError } from '../../middleware/errorHandler';
import { toHttpError } from './shared';
import rateLimit from 'express-rate-limit';

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

const uploadRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
});

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
router.get(
  '/sounds',
  requireAuth,
  asyncHandler(async (_req, res: Response) => {
    const sounds = await voiceManager.listSounds();
    res.json(sounds);
  })
);

// GET /api/recordings - List all voice recordings
router.get(
  '/recordings',
  requireAuth,
  asyncHandler(async (req, res: Response) => {
    const userId = req.query['userId'] as string | undefined;
    const recordings = await storage.listRecordings(userId);
    res.json(recordings);
  })
);

// GET /api/sounds/:name/download - Download a sound file
router.get(
  '/sounds/:name/download',
  requireAuth,
  asyncHandler(async (req, res: Response) => {
    try {
      const filename = req.params.name;
      const stream = await storage.getSoundStream(filename);

      // Set headers for download
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${encodeURIComponent(filename)}"`
      );

      stream.pipe(res);
    } catch (error) {
      throw toHttpError(error, 404);
    }
  })
);

// GET /api/sounds/:name/preview - Stream a sound file for preview
router.get(
  '/sounds/:name/preview',
  requireAuth,
  asyncHandler(async (req, res: Response) => {
    try {
      const filename = req.params['name'];
      const { stream, filename: resolvedName } = await storage.getSoundStreamWithName(filename!);

      // Get the appropriate audio content type based on file extension
      const ext = resolvedName.split('.').pop()?.toLowerCase();
      const contentType = ext ? AUDIO_CONTENT_TYPES[ext] || 'audio/mpeg' : 'audio/mpeg';

      // Set headers for inline playback
      res.setHeader('Content-Type', contentType);
      res.setHeader('Accept-Ranges', 'bytes');

      stream.pipe(res);
    } catch (error) {
      throw toHttpError(error, 404);
    }
  })
);

// POST /api/sounds - Upload one or more sounds
router.post(
  '/sounds',
  uploadRateLimiter,
  requireAuth,
  upload.array('sound', MAX_UPLOAD_FILES),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const files = req.files as Express.Multer.File[] | undefined;
    if (!files || files.length === 0) {
      throw new HttpError(400, 'No files uploaded');
    }
    const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
    if (totalBytes > MAX_TOTAL_UPLOAD_BYTES) {
      throw new HttpError(413, 'Total upload size exceeds 200MB');
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
      throw new HttpError(500, 'All uploads failed');
    }

    res.json({
      message: `Successfully uploaded ${results.length} file(s)${errors.length > 0 ? `, ${errors.length} failed` : ''}`,
      files: results,
      errors: errors.length > 0 ? errors : undefined,
    });
  })
);

// DELETE /api/sounds/:name - Delete a sound
router.delete(
  '/sounds/:name',
  requireAuth,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    try {
      await voiceManager.deleteSound(req.params['name']!);
      res.json({ message: 'Sound deleted successfully' });
    } catch (error) {
      throw toHttpError(error, 404);
    }
  })
);

// Error handling for multer
router.use((error: Error, _req: Request, res: Response, next: NextFunction): void => {
  if (error instanceof HttpError) {
    next(error);
    return;
  }
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      res.status(400).json({ error: 'File too large. Max size is 50MB.' });
      return;
    }
  }
  res.status(400).json({ error: error.message });
});

export default router;
