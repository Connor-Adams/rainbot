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
import { isOpusContainer } from '@rainbot/worker-shared';
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

// Transcoding shells out to ffmpeg, so it is off under jest by default. Tests
// that exercise the transcode paths opt back in and stub ffmpeg themselves.
const TRANSCODE_ENABLED =
  process.env['NODE_ENV'] !== 'test' || process.env['RAINBOT_TEST_TRANSCODE'] === '1';
const RECORDS_PREFIX = 'records/';
const ARCHIVE_PREFIX = 'archived/';
const AUDIO_HEAD_BYTES = 8192;

function isOpusFilename(filename: string): boolean {
  const ext = path.extname(filename).toLowerCase();
  return ext === '.ogg' || ext === '.opus' || ext === '.oga' || ext === '.webm';
}

function toOggFilename(filename: string): string {
  const ext = path.extname(filename);
  if (!ext) return `${filename}.ogg`;
  return filename.slice(0, -ext.length) + '.ogg';
}

/**
 * Decides whether a sound still needs converting to Ogg Opus, judged by the
 * bytes already stored at the destination key rather than by its extension.
 *
 * A `.ogg` upload is just as likely to hold Vorbis as Opus, and the soundboard
 * workers demux Opus directly - a Vorbis payload yields zero packets and plays
 * as silence with no error. `destinationHead` is the head of the object at the
 * Ogg key, or null when nothing is there yet.
 */
export function soundNeedsOpusConversion(name: string, destinationHead: Buffer | null): boolean {
  if (name.startsWith(RECORDS_PREFIX)) return false;
  if (destinationHead === null) return true;
  return !isOpusContainer(destinationHead);
}

/**
 * Packet identifiers that mark an Ogg logical stream as video, matched at the
 * very start of a beginning-of-stream page's payload.
 *
 * Theora is the one actually found in this library (`1-08_Douchebag.ogg` and
 * roughly seventeen siblings probe as `theora` video plus `opus` audio). The
 * rest are the other codecs Ogg is known to carry as video; they cost nothing
 * to check and mean a stray one is caught rather than silently skipped.
 */
const OGG_VIDEO_PACKET_IDS: Buffer[] = [
  Buffer.from('\x80theora', 'latin1'),
  Buffer.from('\x80daala', 'latin1'),
  Buffer.from('OVP80', 'latin1'), // VP8
  Buffer.from('\x01video\0', 'latin1'), // OGM-style video
  Buffer.from('BBCD', 'latin1'), // Dirac
];

/** Fixed part of an Ogg page header, before the segment table. */
const OGG_PAGE_HEADER_BYTES = 27;
/** Byte 5 of a page header; bit 0x02 marks a beginning-of-stream page. */
const OGG_HEADER_TYPE_OFFSET = 5;
const OGG_BOS_FLAG = 0x02;
/** Byte 26 holds the number of entries in the segment table that follows. */
const OGG_SEGMENT_COUNT_OFFSET = 26;

/**
 * Whether a stored object is an Ogg file carrying a video stream.
 *
 * Whisper rejects these outright with `400 Invalid file format` even though the
 * container is Ogg and the Opus inside it is perfectly good, so they have to be
 * found and re-muxed rather than worked around per request.
 *
 * Cheap by construction: Ogg requires every logical stream's
 * beginning-of-stream page to precede any data page, so every codec in the file
 * announces itself in the opening bytes. `readSoundHead`'s 8KB range request is
 * many times more than that - the Theora identifier sits at byte 29 of the
 * affected files - so the whole library is classified with one ranged GET per
 * object and no decoding at all.
 *
 * The walk stops at the first non-BOS page and matches identifiers only at a
 * page payload's first byte, rather than scanning the head for the text
 * `theora`. A Vorbis comment or an ISFT-style encoder tag naming a tool can put
 * that word in an audio-only file, and a substring hit there would send a
 * healthy clip through a needless rewrite.
 *
 * What it misses, stated plainly:
 * - a video codec outside the list above (it then reads as audio-only, the clip
 *   keeps failing at Whisper, and nothing is damaged);
 * - video introduced by a later chain in a chained Ogg stream, since the walk
 *   stops at the first data page;
 * - non-Ogg containers entirely - an `.ogg` key actually holding MP4 or
 *   Matroska bytes is not examined, because it is not the failure being fixed.
 *
 * Every miss is a false negative. There is no input for which this returns true
 * about a file with no video stream, which is the direction that matters: a
 * false positive would put an untouched clip through a rewrite.
 */
export function soundHasVideoStream(head: Buffer | null): boolean {
  if (!head || head.length < OGG_PAGE_HEADER_BYTES) return false;
  if (head.subarray(0, 4).toString('latin1') !== 'OggS') return false;

  let offset = 0;
  while (offset + OGG_PAGE_HEADER_BYTES <= head.length) {
    if (head.subarray(offset, offset + 4).toString('latin1') !== 'OggS') return false;
    const headerType = head[offset + OGG_HEADER_TYPE_OFFSET] as number;
    // All BOS pages come first, so the first page that is not one ends the
    // stream declarations and there is nothing further to learn.
    if ((headerType & OGG_BOS_FLAG) === 0) return false;

    const segmentCount = head[offset + OGG_SEGMENT_COUNT_OFFSET] as number;
    const tableOffset = offset + OGG_PAGE_HEADER_BYTES;
    const payloadOffset = tableOffset + segmentCount;
    if (payloadOffset > head.length) return false;

    for (const id of OGG_VIDEO_PACKET_IDS) {
      if (head.subarray(payloadOffset, payloadOffset + id.length).equals(id)) return true;
    }

    let payloadBytes = 0;
    for (let i = 0; i < segmentCount; i += 1) {
      payloadBytes += head[tableOffset + i] as number;
    }
    const next = payloadOffset + payloadBytes;
    // A page that runs past the head we fetched means the remaining streams are
    // beyond what was read; stop rather than misread the bytes after it.
    if (next <= offset || next > head.length) return false;
    offset = next;
  }

  return false;
}

/** Reads the leading bytes of a stored sound, or null when unreadable. */
export async function readSoundHead(filename: string): Promise<Buffer | null> {
  if (!s3Client || !bucketName) return null;
  try {
    const response = await s3Client.send(
      new GetObjectCommand({
        Bucket: bucketName,
        Key: `sounds/${filename}`,
        Range: `bytes=0-${AUDIO_HEAD_BYTES - 1}`,
      })
    );
    return await bodyToBuffer(response.Body);
  } catch {
    return null;
  }
}

/**
 * Reads a stored sound's full bytes from its own key, or null when the object
 * has no body. Errors are left to the caller.
 *
 * Unlike `getSoundBuffer` this does no name resolution, so it never fires off a
 * background transcode of a neighbouring key - which is what a sweep wants: the
 * object it listed is the object it reads.
 */
async function readSoundObject(filename: string): Promise<Buffer | null> {
  if (!s3Client || !bucketName) return null;
  const response = await s3Client.send(
    new GetObjectCommand({
      Bucket: bucketName,
      Key: `sounds/${filename}`,
    })
  );
  return bodyToBuffer(response.Body);
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

/**
 * Pipes `buffer` through ffmpeg with `args` and resolves its stdout.
 *
 * Shared by every ffmpeg call in this module so the stdin handling below is
 * written once. That handling is not incidental: any early exit - malformed
 * input ffmpeg refuses to decode, a missing encoder - leaves Node writing into
 * a closed pipe, and an unhandled 'error' event on that socket takes the
 * process with it (a sticky `process.exitCode = 1` under Raincloud's handler,
 * an outright `process.exit(1)` under worker-shared's, which would end a sweep
 * partway through the library). The listener settles nothing: the 'close' and
 * child-'error' handlers already cover every outcome, and it must be attached
 * before the write because a pipe an exited ffmpeg already closed fails inside
 * `write()` itself.
 */
async function runFfmpeg(args: string[], buffer: Uint8Array): Promise<Buffer<ArrayBufferLike>> {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', args);

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

    ffmpeg.stdin.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EPIPE') return;
      log.debug(`ffmpeg stdin error (${error.code ?? 'no code'}): ${error.message}`);
    });

    ffmpeg.stdin.write(buffer);
    ffmpeg.stdin.end();
  });
}

async function transcodeToOggOpus(buffer: Uint8Array): Promise<Buffer<ArrayBufferLike>> {
  return runFfmpeg(
    [
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
    ],
    buffer
  );
}

/**
 * Drops every video stream from an Ogg clip, copying the audio packets across
 * untouched.
 *
 * `-vn` with `-c:a copy` is a re-mux, not a re-encode: the Opus packets that
 * come out are bit-for-bit the ones that went in, so the clip sounds exactly as
 * it did and the operation costs no quality and almost no CPU. Verified against
 * ffmpeg 8.0.1 on a Theora+Opus clip - the output probes as a single 48kHz
 * mono Opus stream of the same duration, and its first page carries `OpusHead`
 * at the payload offset `isOpusContainer` checks.
 */
async function stripVideoFromOgg(buffer: Uint8Array): Promise<Buffer<ArrayBufferLike>> {
  return runFfmpeg(
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-i',
      'pipe:0',
      '-vn',
      '-c:a',
      'copy',
      '-f',
      'ogg',
      'pipe:1',
    ],
    buffer
  );
}

async function ensureOggCopy(
  originalName: string,
  oggName: string,
  options?: { force?: boolean }
): Promise<void> {
  if (!s3Client || !bucketName) return;
  if (options?.force) {
    // The destination already holds playable-looking bytes we are about to
    // overwrite in place, so keep a copy before touching it.
    await backupSound(oggName);
    if (!(await writeOggCopy(originalName, oggName))) {
      throw new Error(`Transcode produced nothing for ${originalName}`);
    }
    return;
  }
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

  await writeOggCopy(originalName, oggName);
}

/** Returns true when an Ogg Opus object was written to `oggName`. */
async function writeOggCopy(originalName: string, oggName: string): Promise<boolean> {
  if (!s3Client || !bucketName) return false;

  try {
    const sourceBuffer = await readSoundObject(originalName);
    if (!sourceBuffer) {
      return false;
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
    return true;
  } catch (error) {
    const err = error as Error;
    log.warn(`Failed to transcode ${originalName}: ${err.message}`);
    return false;
  }
}

/**
 * Copies a sound under `sounds/archived/`, leaving the original where it is.
 * Archived objects are excluded from listSounds(), so a backup never shows up
 * in the soundboard.
 */
export async function backupSound(filename: string): Promise<void> {
  if (!s3Client || !bucketName) {
    throw new Error('Storage not configured');
  }

  const sourceKey = `sounds/${filename}`;
  const encodedSource = encodeURIComponent(sourceKey).replace(/%2F/g, '/');
  await s3Client.send(
    new CopyObjectCommand({
      Bucket: bucketName,
      CopySource: `${bucketName}/${encodedSource}`,
      Key: `sounds/${ARCHIVE_PREFIX}${filename}`,
    })
  );
}

async function archiveSound(filename: string): Promise<void> {
  await backupSound(filename);
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
    const oggName = toOggFilename(name);
    const destinationHead = await readSoundHead(oggName);
    if (!soundNeedsOpusConversion(name, destinationHead)) {
      skipped += 1;
      continue;
    }

    try {
      await ensureOggCopy(name, oggName, { force: destinationHead !== null });
      if (await soundExists(oggName)) {
        converted += 1;
        // A non-Opus `.ogg` is rewritten in place, so its source and its
        // destination are the same key - archiving it would delete the
        // conversion we just wrote.
        if (deleteOriginal && name !== oggName) {
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
 * Rewrites every stored Ogg clip that carries a video stream as audio only.
 *
 * Roughly eighteen objects in this library are Ogg files holding a Theora video
 * stream alongside their Opus audio - `1-08_Douchebag.ogg` probes as
 * `theora`/video 44.7s plus `opus`/audio 44.7s. Whisper refuses the container
 * outright with `400 Invalid file format`, so those clips have never had a
 * speech transcript, and every analysis run re-attempts and re-fails them. The
 * stored objects are fixed once here rather than worked around on each request.
 *
 * The rewrite is a re-mux, not a re-encode (see `stripVideoFromOgg`), so the
 * audio comes out bit-for-bit identical and the clip is written back to its own
 * key - the soundboard's sound list, customizations, analysis rows and Discord
 * command choices all key off the filename and would break if it moved.
 *
 * Safety, following `sweepTranscodeSounds`:
 * - the original is copied to `sounds/archived/` and only then overwritten, so
 *   a bad rewrite is recoverable;
 * - the archive copy is never deleted. The transcode sweep's `deleteOriginal`
 *   has no counterpart here for the reason its own guard exists: source and
 *   destination are the same key, so "delete the original" would delete the
 *   rewrite. `dryRun` takes its place - it reports exactly what a real run
 *   would touch while writing nothing;
 * - a rewrite that yields no bytes, or yields something that is no longer a
 *   container the players can read, is counted as a failure and the stored
 *   object is left exactly as it was.
 */
export async function sweepStripSoundVideo(options?: {
  dryRun?: boolean;
  limit?: number;
}): Promise<{ stripped: number; archived: number; skipped: number; failed: number }> {
  if (!s3Client || !bucketName) {
    throw new Error('Storage not configured');
  }

  if (!TRANSCODE_ENABLED) {
    return { stripped: 0, archived: 0, skipped: 0, failed: 0 };
  }

  const dryRun = options?.dryRun ?? false;
  const limit = options?.limit ?? 0;
  let stripped = 0;
  let archived = 0;
  let skipped = 0;
  let failed = 0;

  const sounds = await listSounds();
  let processed = 0;

  for (const sound of sounds) {
    if (limit > 0 && processed >= limit) break;
    processed += 1;

    const name = sound.name;
    const head = await readSoundHead(name);
    if (!soundHasVideoStream(head)) {
      skipped += 1;
      continue;
    }

    if (dryRun) {
      log.info(`Would strip video from ${name}`);
      stripped += 1;
      continue;
    }

    try {
      const source = await readSoundObject(name);
      if (!source) {
        throw new Error('stored object has no body');
      }

      // Archive before anything is written back, never after: the copy is the
      // only way back if the re-mux turns out to be wrong.
      await backupSound(name);
      archived += 1;

      const audioOnly = await stripVideoFromOgg(source);
      if (audioOnly.length === 0) {
        throw new Error('ffmpeg produced no output');
      }
      // The re-mux has to leave something the soundboard can still play. A
      // stream copy that dropped the audio too, or emitted a container the
      // demuxers do not read, would otherwise be written straight over a clip
      // that at least played.
      if (!isOpusContainer(audioOnly)) {
        throw new Error('re-muxed output is not a container the players read');
      }
      if (soundHasVideoStream(audioOnly)) {
        throw new Error('re-muxed output still declares a video stream');
      }

      await s3Client.send(
        new PutObjectCommand({
          Bucket: bucketName,
          Key: `sounds/${name}`,
          Body: audioOnly,
          ContentType: 'audio/ogg',
        })
      );
      stripped += 1;
      log.info(
        `Stripped video from ${name} (${source.length} -> ${audioOnly.length} bytes, original archived)`
      );
    } catch (error) {
      const err = error as Error;
      failed += 1;
      log.warn(`Video strip failed for ${name}: ${err.message}`);
    }
  }

  return { stripped, archived, skipped, failed };
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

/** Reads a stored sound fully into memory, for analysis. */
export async function getSoundBuffer(filename: string): Promise<Buffer> {
  const stream = await getSoundStream(filename);
  return streamToBuffer(stream);
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
  if (!isRecording && TRANSCODE_ENABLED && !isOpusContainer(buffer)) {
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

const YOUTUBE_COOKIES_KEY = 'cookies/youtube_cookies.txt';
const YOUTUBE_PROXY_KEY = 'settings/youtube_proxy.txt';

function proxySettingsPath(): string {
  const dir = process.env['COOKIES_DIR'] || path.join(process.cwd(), 'data', 'cookies');
  return path.join(dir, 'youtube_proxy.txt');
}

/**
 * Store the outbound proxy URL used for YouTube requests.
 *
 * The value usually embeds credentials, so it is never written to the log -
 * only the fact that it changed.
 */
export async function setYoutubeProxy(proxyUrl: string): Promise<void> {
  const body = Buffer.from(proxyUrl, 'utf8');

  if (s3Client && bucketName) {
    await s3Client.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: YOUTUBE_PROXY_KEY,
        Body: body,
        ContentType: 'text/plain',
      })
    );
    log.info('Stored YouTube proxy URL');
    return;
  }

  const fs = await import('fs/promises');
  const filePath = proxySettingsPath();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, body);
  log.info('Stored YouTube proxy URL locally');
}

/** Returns the configured proxy URL, or null when none is set. */
export async function getYoutubeProxy(): Promise<string | null> {
  let raw: Buffer | null = null;

  if (s3Client && bucketName) {
    try {
      const response = await s3Client.send(
        new GetObjectCommand({ Bucket: bucketName, Key: YOUTUBE_PROXY_KEY })
      );
      raw = await bodyToBuffer(response.Body);
    } catch (error) {
      const err = error as S3Error;
      if (err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) return null;
      throw error;
    }
  } else {
    const fs = await import('fs/promises');
    try {
      raw = await fs.readFile(proxySettingsPath());
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === 'ENOENT') return null;
      throw error;
    }
  }

  const value = raw?.toString('utf8').trim() ?? '';
  return value.length > 0 ? value : null;
}

/** Remove the configured proxy URL. */
export async function deleteYoutubeProxy(): Promise<void> {
  if (s3Client && bucketName) {
    await s3Client.send(new DeleteObjectCommand({ Bucket: bucketName, Key: YOUTUBE_PROXY_KEY }));
    log.info('Deleted YouTube proxy URL');
    return;
  }

  const fs = await import('fs/promises');
  try {
    await fs.unlink(proxySettingsPath());
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code !== 'ENOENT') throw error;
  }
  log.info('Deleted local YouTube proxy URL');
}

/**
 * Upload YouTube cookies (Netscape format) for yt-dlp authentication.
 * Stores in S3 under cookies/ or local fallback when S3 is not configured.
 */
export async function uploadYoutubeCookies(buffer: Buffer): Promise<void> {
  if (s3Client && bucketName) {
    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: YOUTUBE_COOKIES_KEY,
      Body: buffer,
      ContentType: 'text/plain',
    });
    await s3Client.send(command);
    log.info('Uploaded YouTube cookies to S3');
    return;
  }

  const fs = await import('fs/promises');
  const cookiesDir = process.env['COOKIES_DIR'] || path.join(process.cwd(), 'data', 'cookies');
  await fs.mkdir(cookiesDir, { recursive: true });
  const filePath = path.join(cookiesDir, 'youtube_cookies.txt');
  await fs.writeFile(filePath, buffer);
  log.info(`Uploaded YouTube cookies to local: ${filePath}`);
}

/**
 * Get YouTube cookies content. Returns null if not stored.
 */
export async function getYoutubeCookies(): Promise<Buffer | null> {
  if (s3Client && bucketName) {
    try {
      const command = new GetObjectCommand({
        Bucket: bucketName,
        Key: YOUTUBE_COOKIES_KEY,
      });
      const response = await s3Client.send(command);
      const buf = await bodyToBuffer(response.Body);
      return buf;
    } catch (error) {
      const err = error as S3Error;
      if (err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) {
        return null;
      }
      throw error;
    }
  }

  const fs = await import('fs/promises');
  const cookiesDir = process.env['COOKIES_DIR'] || path.join(process.cwd(), 'data', 'cookies');
  const filePath = path.join(cookiesDir, 'youtube_cookies.txt');
  try {
    return await fs.readFile(filePath);
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === 'ENOENT') return null;
    throw error;
  }
}

/**
 * Check if YouTube cookies are stored.
 */
export async function hasYoutubeCookies(): Promise<boolean> {
  if (s3Client && bucketName) {
    try {
      const command = new HeadObjectCommand({
        Bucket: bucketName,
        Key: YOUTUBE_COOKIES_KEY,
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

  const fs = await import('fs/promises');
  const cookiesDir = process.env['COOKIES_DIR'] || path.join(process.cwd(), 'data', 'cookies');
  const filePath = path.join(cookiesDir, 'youtube_cookies.txt');
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Delete stored YouTube cookies.
 */
export async function deleteYoutubeCookies(): Promise<boolean> {
  if (s3Client && bucketName) {
    try {
      const command = new DeleteObjectCommand({
        Bucket: bucketName,
        Key: YOUTUBE_COOKIES_KEY,
      });
      await s3Client.send(command);
      log.info('Deleted YouTube cookies from S3');
      return true;
    } catch (error) {
      const err = error as S3Error;
      if (err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) {
        return true;
      }
      throw error;
    }
  }

  const fs = await import('fs/promises');
  const cookiesDir = process.env['COOKIES_DIR'] || path.join(process.cwd(), 'data', 'cookies');
  const filePath = path.join(cookiesDir, 'youtube_cookies.txt');
  try {
    await fs.unlink(filePath);
    log.info('Deleted YouTube cookies from local');
    return true;
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === 'ENOENT') return true;
    throw error;
  }
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
