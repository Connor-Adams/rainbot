import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { Readable } from 'stream';
import * as fs from 'fs';
import * as path from 'path';
import { StreamType } from '@discordjs/voice';
import { logErrorWithStack } from '@rainbot/worker-shared';
import {
  log,
  SOUNDS_DIR,
  S3_BUCKET,
  S3_ACCESS_KEY,
  S3_SECRET_KEY,
  S3_ENDPOINT,
  S3_REGION,
} from '../config';

let s3Client: S3Client | null = null;
if (S3_BUCKET && S3_ACCESS_KEY && S3_SECRET_KEY && S3_ENDPOINT) {
  s3Client = new S3Client({
    endpoint: S3_ENDPOINT,
    region: S3_REGION,
    credentials: {
      accessKeyId: S3_ACCESS_KEY,
      secretAccessKey: S3_SECRET_KEY,
    },
    forcePathStyle: false,
  });
  log.info(`S3 storage initialized: bucket "${S3_BUCKET}"`);
} else {
  log.info(`S3 not configured, using local storage: ${SOUNDS_DIR}`);
}

export function getS3Client(): S3Client | null {
  return s3Client;
}

export function responseBodyToStream(body: unknown): Readable | null {
  if (
    body &&
    typeof (body as { transformToWebStream?: () => unknown }).transformToWebStream === 'function'
  ) {
    const webStream = (body as { transformToWebStream: () => unknown }).transformToWebStream();
    return Readable.fromWeb(webStream as import('stream/web').ReadableStream);
  }
  if (body instanceof Readable) {
    return body;
  }
  return null;
}

export function getOggVariant(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  if (ext === '.ogg' || ext === '.opus' || ext === '.oga' || ext === '.webm') {
    return filename;
  }
  if (!ext) return `${filename}.ogg`;
  return filename.slice(0, -ext.length) + '.ogg';
}

export function normalizeSoundName(sfxId: string): string {
  return sfxId.includes('.') ? sfxId : `${sfxId}.mp3`;
}

export function getSoundInputType(sfxId: string): StreamType {
  const ext = path.extname(normalizeSoundName(sfxId)).toLowerCase();
  if (ext === '.ogg' || ext === '.opus' || ext === '.oga') {
    return StreamType.OggOpus;
  }
  if (ext === '.webm') {
    return StreamType.WebmOpus;
  }
  return StreamType.Arbitrary;
}

export async function getSoundStream(sfxId: string): Promise<Readable> {
  const filename = normalizeSoundName(sfxId);
  const oggFilename = getOggVariant(filename);
  log.debug(`Soundboard fetch start name=${filename}`);

  if (s3Client && S3_BUCKET) {
    try {
      if (oggFilename !== filename) {
        try {
          log.debug(`Soundboard fetch S3 bucket=${S3_BUCKET} key=sounds/${oggFilename}`);
          const oggResponse = await s3Client.send(
            new GetObjectCommand({
              Bucket: S3_BUCKET,
              Key: `sounds/${oggFilename}`,
            })
          );
          const oggStream = responseBodyToStream(oggResponse.Body);
          if (oggStream) {
            log.debug(`Soundboard fetch S3 stream ready name=${oggFilename}`);
            return oggStream;
          }
        } catch (error) {
          const err = error as { name?: string; $metadata?: { httpStatusCode?: number } };
          if (err.name !== 'NoSuchKey' && err.$metadata?.httpStatusCode !== 404) {
            logErrorWithStack(log, `S3 fetch failed for ${oggFilename}`, error);
          }
        }
      }

      log.debug(`Soundboard fetch S3 bucket=${S3_BUCKET} key=sounds/${filename}`);
      const response = await s3Client.send(
        new GetObjectCommand({
          Bucket: S3_BUCKET,
          Key: `sounds/${filename}`,
        })
      );
      const stream = responseBodyToStream(response.Body);
      if (stream) {
        log.debug(`Soundboard fetch S3 stream ready name=${filename}`);
        return stream;
      }
      throw new Error('Invalid response body from S3');
    } catch (error) {
      logErrorWithStack(log, `S3 fetch failed for ${filename}`, error);
    }
  }

  const localOggPath = path.join(SOUNDS_DIR, oggFilename);
  if (oggFilename !== filename && fs.existsSync(localOggPath)) {
    log.debug(`Loading sound from local: ${localOggPath}`);
    return fs.createReadStream(localOggPath);
  }

  const localPath = path.join(SOUNDS_DIR, filename);
  if (fs.existsSync(localPath)) {
    log.debug(`Loading sound from local: ${localPath}`);
    return fs.createReadStream(localPath);
  }

  throw new Error(`Sound file not found: ${filename}`);
}
