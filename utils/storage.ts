import path from 'path';
import { Readable } from 'stream';
import { spawn } from 'child_process';
import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  CopyObjectCommand,
} from '@aws-sdk/client-s3';
import { createLogger } from './logger';
import { loadConfig } from './config';

const log = createLogger('STORAGE');

let s3Client: S3Client | null = null;
let bucketName: string | null = null;

export interface SoundFile {
  name: string;
  size: number;
  createdAt: Date;
}

const TRANSCODE_ENABLED = process.env['NODE_ENV'] !== 'test';
const RECORDS_PREFIX = 'records/';
const ARCHIVE_PREFIX = 'archived/';

function isOpusFilename(filename: string): boolean {
  const ext = path.extname(filename).toLowerCase();
  return ext === '.ogg' || ext === '.opus' || ext === '.oga' || ext === '.webm';
}

function toOggFilename(filename: string): string {
  const ext = path.extname(filename);
  if (!ext) return `${filename}.ogg`;
  return filename.slice(0, -ext.length) + '.ogg';
}

async function streamToBuffer(stream: AsyncIterable<Uint8Array>): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function bodyToBuffer(body: unknown): Promise<Buffer | null> {
  if (!body) return null;
  if (Buffer.isBuffer(body)) return body;
  if (body instanceof Readable) return streamToBuffer(body);
  if (
    typeof (body as { transformToWebStream?: () => ReadableStream }).transformToWebStream ===
    'function'
  ) {
    const webStream = (
      body as { transformToWebStream: () => ReadableStream }
    ).transformToWebStream();
    return streamToBuffer(Readable.fromWeb(webStream as Parameters<typeof Readable.fromWeb>[0]));
  }
  if (typeof (body as Blob).arrayBuffer === 'function') {
    const arrayBuffer = await (body as Blob).arrayBuffer();
    return Buffer.from(arrayBuffer);
  }
  if (Symbol.asyncIterator in Object(body)) {
    return streamToBuffer(body as AsyncIterable<Uint8Array>);
  }
  return null;
}

async function transcodeToOggOpus(buffer: Uint8Array): Promise<Buffer<ArrayBufferLike>> {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', [
      '-hide_banner',
      '-loglevel',
      'error',
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

    ffmpeg.stdin.write(buffer);
    ffmpeg.stdin.end();
  });
}

async function ensureOggCopy(originalName: string, oggName: string): Promise<void> {
  if (!s3Client || !bucketName) return;
  try {
    const head = new HeadObjectCommand({
      Bucket: bucketName,
      Key: `sounds/${oggName}`,
    });
    await s3Client.send(head);
    return;
  } catch {
    // Continue to attempt conversion.
  }

  try {
    const getCommand = new GetObjectCommand({
      Bucket: bucketName,
      Key: `sounds/${originalName}`,
    });
    const response = await s3Client.send(getCommand);
    const sourceBuffer = await bodyToBuffer(response.Body);
    if (!sourceBuffer) {
      return;
    }
    const oggBuffer = await transcodeToOggOpus(sourceBuffer);

    const putCommand = new PutObjectCommand({
      Bucket: bucketName,
      Key: `sounds/${oggName}`,
      Body: oggBuffer,
      ContentType: 'audio/ogg',
    });
    await s3Client.send(putCommand);
    log.info(`Transcoded sound to Ogg Opus: ${oggName}`);
  } catch (error) {
    const err = error as Error;
    log.warn(`Failed to transcode ${originalName}: ${err.message}`);
  }
}

async function archiveSound(filename: string): Promise<void> {
  if (!s3Client || !bucketName) {
    throw new Error('Storage not configured');
  }

  const sourceKey = `sounds/${filename}`;
  const encodedSource = encodeURIComponent(sourceKey).replace(/%2F/g, '/');
  const copyCommand = new CopyObjectCommand({
    Bucket: bucketName,
    CopySource: `${bucketName}/${encodedSource}`,
    Key: `sounds/${ARCHIVE_PREFIX}${filename}`,
  });

  await s3Client.send(copyCommand);
  await deleteSound(filename);
}

async function resolveSoundFilename(filename: string): Promise<string> {
  const isRecording = filename.startsWith(RECORDS_PREFIX);
  if (!isRecording && TRANSCODE_ENABLED && !isOpusFilename(filename)) {
    const oggName = toOggFilename(filename);
    if (await soundExists(oggName)) {
      return oggName;
    }
    void ensureOggCopy(filename, oggName);
  }
  return filename;
}

/**
 * Initialize storage - requires Railway S3-compatible bucket
 */
function initStorage(): void {
  const config = loadConfig();

  // Railway Bucket service variables can be:
  // - AWS_* prefix: AWS_S3_BUCKET_NAME, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_ENDPOINT_URL, AWS_DEFAULT_REGION
  // - Legacy: BUCKET, ACCESS_KEY_ID, SECRET_ACCESS_KEY, ENDPOINT, REGION
  // - Manual config: STORAGE_BUCKET_NAME, STORAGE_ACCESS_KEY, STORAGE_SECRET_KEY, STORAGE_ENDPOINT, STORAGE_REGION
  const storageVars: Record<string, boolean> = {
    'bucket (AWS_S3_BUCKET_NAME, BUCKET, or STORAGE_BUCKET_NAME)': !!config.storageBucketName,
    'accessKey (AWS_ACCESS_KEY_ID, ACCESS_KEY_ID, or STORAGE_ACCESS_KEY)':
      !!config.storageAccessKey,
    'secretKey (AWS_SECRET_ACCESS_KEY, SECRET_ACCESS_KEY, or STORAGE_SECRET_KEY)':
      !!config.storageSecretKey,
    'endpoint (AWS_ENDPOINT_URL, ENDPOINT, or STORAGE_ENDPOINT)': !!config.storageEndpoint,
  };

  const missingVars = Object.entries(storageVars)
    .filter(([, present]) => !present)
    .map(([name]) => name);

  // S3 configuration is optional - storage features will be disabled without it
  if (missingVars.length > 0) {
    // Log all available environment variables for debugging
    const allEnvVars = Object.keys(process.env).filter(
      (key) =>
        key.startsWith('AWS_') ||
        key.includes('BUCKET') ||
        key.includes('ACCESS') ||
        key.includes('SECRET') ||
        key.includes('ENDPOINT') ||
        key.includes('STORAGE')
    );

    log.warn(`S3 storage not configured. Sound file storage features will be disabled.`);
    if (allEnvVars.length > 0) {
      log.info(`Found these storage-related environment variables: ${allEnvVars.join(', ')}`);
      log.info(
        `Tip: Railway Bucket service variables may need to be manually set as STORAGE_* variables`
      );
    }

    // Don't throw - allow bot to run without storage
    return;
  }

  try {
    s3Client = new S3Client({
      endpoint: config.storageEndpoint,
      region: config.storageRegion || 'us-east-1',
      credentials: {
        accessKeyId: config.storageAccessKey!,
        secretAccessKey: config.storageSecretKey!,
      },
      forcePathStyle: false, // Railway uses virtual-hosted-style URLs (bucket.endpoint/key)
    });

    bucketName = config.storageBucketName!;

    log.info(`✓ Storage initialized: S3 bucket "${bucketName}" at ${config.storageEndpoint}`);
  } catch (error) {
    const err = error as Error;
    log.error(`✗ Failed to initialize S3 storage: ${err.message}`);
    throw error;
  }
}

/**
 * List all sound files from S3
 */
export async function listSounds(): Promise<SoundFile[]> {
  if (!s3Client || !bucketName) {
    log.warn('Storage not configured - cannot list sounds');
    return [];
  }

  const sounds: SoundFile[] = [];

  try {
    const command = new ListObjectsV2Command({
      Bucket: bucketName,
      Prefix: 'sounds/',
    });

    const response = await s3Client.send(command);

    if (response.Contents) {
      response.Contents.filter(
        (obj) =>
          obj.Key &&
          /\.(mp3|wav|ogg|m4a|webm|flac)$/i.test(obj.Key) &&
          !obj.Key.includes('sounds/records/') && // Exclude recordings from main list
          !obj.Key.includes(`sounds/${ARCHIVE_PREFIX}`) // Exclude archived originals
      ).forEach((obj) => {
        const name = path.basename(obj.Key!);
        if (TRANSCODE_ENABLED && !isOpusFilename(name)) {
          void ensureOggCopy(name, toOggFilename(name));
        }
        sounds.push({
          name: name,
          size: obj.Size || 0,
          createdAt: obj.LastModified || new Date(),
        });
      });
    }
  } catch (error) {
    const err = error as Error;
    log.error(`Error listing sounds from S3: ${err.message}`);
    throw error;
  }

  return sounds;
}

export async function sweepTranscodeSounds(options?: {
  deleteOriginal?: boolean;
  limit?: number;
}): Promise<{ converted: number; deleted: number; skipped: number }> {
  if (!s3Client || !bucketName) {
    throw new Error('Storage not configured');
  }

  if (!TRANSCODE_ENABLED) {
    return { converted: 0, deleted: 0, skipped: 0 };
  }

  const deleteOriginal = options?.deleteOriginal ?? false;
  const limit = options?.limit ?? 0;
  let converted = 0;
  let deleted = 0;
  let skipped = 0;

  const sounds = await listSounds();
  let processed = 0;

  for (const sound of sounds) {
    if (limit > 0 && processed >= limit) break;
    processed += 1;

    const name = sound.name;
    if (name.startsWith(RECORDS_PREFIX) || isOpusFilename(name)) {
      skipped += 1;
      continue;
    }

    const oggName = toOggFilename(name);
    try {
      await ensureOggCopy(name, oggName);
      if (await soundExists(oggName)) {
        converted += 1;
        if (deleteOriginal) {
          await archiveSound(name);
          deleted += 1;
        }
      }
    } catch (error) {
      const err = error as Error;
      log.warn(`Sweep transcode failed for ${name}: ${err.message}`);
    }
  }

  return { converted, deleted, skipped };
}

/**
 * List voice recordings for a specific user
 */
export async function listRecordings(userId?: string): Promise<SoundFile[]> {
  if (!s3Client || !bucketName) {
    log.warn('Storage not configured - cannot list recordings');
    return [];
  }

  const recordings: SoundFile[] = [];

  try {
    const prefix = userId ? `sounds/records/${userId}-` : 'sounds/records/';
    const command = new ListObjectsV2Command({
      Bucket: bucketName,
      Prefix: prefix,
    });

    const response = await s3Client.send(command);

    if (response.Contents) {
      response.Contents.forEach((obj) => {
        if (obj.Key) {
          const name = path.basename(obj.Key);
          recordings.push({
            name: name,
            size: obj.Size || 0,
            createdAt: obj.LastModified || new Date(),
          });
        }
      });
    }
  } catch (error) {
    const err = error as Error;
    log.error(`Error listing recordings from S3: ${err.message}`);
    throw error;
  }

  return recordings;
}

interface S3ErrorMetadata {
  httpStatusCode?: number;
}

interface S3Error extends Error {
  $metadata?: S3ErrorMetadata;
}

/**
 * Get a readable stream for a sound file from S3
 */
export async function getSoundStream(filename: string): Promise<Readable> {
  if (!s3Client || !bucketName) {
    throw new Error('Storage not configured');
  }

  const resolvedName = await resolveSoundFilename(filename);

  try {
    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: `sounds/${resolvedName}`,
    });

    const response = await s3Client.send(command);

    // Convert AWS SDK stream to Node.js stream if needed
    if (response.Body instanceof Readable) {
      return response.Body;
    } else if (
      response.Body &&
      typeof (response.Body as { transformToWebStream?: () => ReadableStream })
        .transformToWebStream === 'function'
    ) {
      // Handle web streams (newer AWS SDK versions)
      const webStream = (
        response.Body as { transformToWebStream: () => ReadableStream }
      ).transformToWebStream();
      return Readable.fromWeb(webStream as Parameters<typeof Readable.fromWeb>[0]);
    } else if (response.Body) {
      // Fallback: convert to buffer then stream
      const chunks: Buffer[] = [];
      for await (const chunk of response.Body as AsyncIterable<Buffer>) {
        chunks.push(chunk);
      }
      return Readable.from(Buffer.concat(chunks));
    } else {
      throw new Error('Empty response body');
    }
  } catch (error) {
    const err = error as S3Error;
    if (err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) {
      throw new Error(`Sound not found: ${resolvedName}`);
    }
    throw error;
  }
}

export async function getSoundStreamWithName(
  filename: string
): Promise<{ stream: Readable; filename: string }> {
  const resolvedName = await resolveSoundFilename(filename);
  const stream = await getSoundStream(resolvedName);
  return { stream, filename: resolvedName };
}

/**
 * Upload a sound file to S3
 */
export async function uploadSound(
  fileStream: AsyncIterable<Buffer>,
  filename: string
): Promise<string> {
  if (!s3Client || !bucketName) {
    throw new Error('Storage not configured');
  }

  // Sanitize filename (preserve forward slashes for subdirectories)
  const safeName = filename.replace(/[^a-zA-Z0-9._/-]/g, '_');

  // Read stream into buffer (required for S3)
  const chunks: Buffer[] = [];
  for await (const chunk of fileStream) {
    chunks.push(chunk);
  }
  const buffer: Buffer<ArrayBufferLike> = Buffer.concat(chunks);

  let uploadName = safeName;
  let uploadBuffer: Buffer<ArrayBufferLike> = buffer;
  let contentType = getContentType(uploadName);
  const isRecording = uploadName.startsWith(RECORDS_PREFIX);
  if (!isRecording && TRANSCODE_ENABLED && !isOpusFilename(uploadName)) {
    try {
      uploadBuffer = await transcodeToOggOpus(buffer);
      uploadName = toOggFilename(uploadName);
      contentType = 'audio/ogg';
    } catch (error) {
      const err = error as Error;
      log.warn(`Transcode failed for ${uploadName}: ${err.message}`);
    }
  }

  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: `sounds/${uploadName}`,
    Body: uploadBuffer,
    ContentType: contentType,
  });

  await s3Client.send(command);
  log.info(`Uploaded sound to S3: ${uploadName}`);
  return uploadName;
}

/**
 * Upload a voice recording to S3 under records folder
 */
export async function uploadRecording(
  audioBuffer: Buffer,
  userId: string,
  timestamp: number
): Promise<string> {
  if (!s3Client || !bucketName) {
    throw new Error('Storage not configured');
  }

  // Create filename with user ID
  const filename = `${userId}-${timestamp}.raw`;
  const key = `sounds/records/${filename}`;

  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    Body: audioBuffer,
    ContentType: 'audio/pcm',
    Metadata: {
      'user-id': userId,
      'recorded-at': new Date(timestamp).toISOString(),
      format: 'pcm-s16le-48000-stereo',
    },
  });

  await s3Client.send(command);
  log.info(`Uploaded recording to S3: ${key} (${audioBuffer.length} bytes)`);
  return filename;
}

/**
 * Delete a sound file from S3
 */
export async function deleteSound(filename: string): Promise<boolean> {
  if (!s3Client || !bucketName) {
    throw new Error('Storage not configured');
  }

  const command = new DeleteObjectCommand({
    Bucket: bucketName,
    Key: `sounds/${filename}`,
  });

  await s3Client.send(command);
  log.info(`Deleted sound from S3: ${filename}`);
  return true;
}

/**
 * Check if a sound file exists in S3
 */
export async function soundExists(filename: string): Promise<boolean> {
  if (!s3Client || !bucketName) {
    return false;
  }

  try {
    const command = new HeadObjectCommand({
      Bucket: bucketName,
      Key: `sounds/${filename}`,
    });

    await s3Client.send(command);
    return true;
  } catch (error) {
    const err = error as S3Error;
    if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) {
      return false;
    }
    throw error;
  }
}

/**
 * Get content type based on file extension
 */
function getContentType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  const types: Record<string, string> = {
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
    '.m4a': 'audio/mp4',
    '.webm': 'audio/webm',
    '.flac': 'audio/flac',
  };
  return types[ext] || 'application/octet-stream';
}

/**
 * Check if storage is configured and available
 */
export function isStorageConfigured(): boolean {
  return s3Client !== null && bucketName !== null;
}

/**
 * Get storage type
 */
export function getStorageType(): string {
  return 's3';
}

// Initialize storage on module load
initStorage();
