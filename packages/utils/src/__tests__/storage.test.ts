/* eslint-disable @typescript-eslint/no-explicit-any */
import { Readable } from 'stream';

// Mock logger
const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  http: jest.fn(),
};

jest.mock('@rainbot/utils/logger', () => ({
  createLogger: jest.fn(() => mockLogger),
}));

// Mock config
const mockConfig = {
  storageBucketName: 'test-bucket',
  storageAccessKey: 'test-access-key',
  storageSecretKey: 'test-secret-key',
  storageEndpoint: 'https://s3.example.com',
  storageRegion: 'us-east-1',
};

jest.mock('@rainbot/utils/config', () => ({
  loadConfig: jest.fn(() => mockConfig),
}));

// Mock AWS SDK
const mockSend = jest.fn();
const mockS3Client = {
  send: mockSend,
};

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn(() => mockS3Client),
  ListObjectsV2Command: jest.fn(),
  GetObjectCommand: jest.fn(),
  PutObjectCommand: jest.fn(),
  DeleteObjectCommand: jest.fn(),
  HeadObjectCommand: jest.fn(),
  CopyObjectCommand: jest.fn(),
}));

describe('storage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockConfig.storageBucketName = 'test-bucket';
    mockConfig.storageAccessKey = 'test-access-key';
    mockConfig.storageSecretKey = 'test-secret-key';
    mockConfig.storageEndpoint = 'https://s3.example.com';
    jest.resetModules();
  });

  describe('listSounds', () => {
    it('returns empty array when storage is not configured', async () => {
      (mockConfig as any).storageBucketName = undefined;
      const { listSounds } = require('@rainbot/utils/storage');

      const sounds = await listSounds();

      expect(sounds).toEqual([]);
      expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('not configured'));
    });

    it('lists sound files from S3', async () => {
      mockSend.mockResolvedValueOnce({
        Contents: [
          {
            Key: 'sounds/test.mp3',
            Size: 1024,
            LastModified: new Date('2024-01-01'),
          },
          {
            Key: 'sounds/sample.wav',
            Size: 2048,
            LastModified: new Date('2024-01-02'),
          },
        ],
      });

      const { listSounds } = require('@rainbot/utils/storage');
      const sounds = await listSounds();

      expect(sounds).toHaveLength(2);
      expect(sounds[0]).toEqual({
        name: 'test.mp3',
        size: 1024,
        createdAt: new Date('2024-01-01'),
      });
      expect(sounds[1]).toEqual({
        name: 'sample.wav',
        size: 2048,
        createdAt: new Date('2024-01-02'),
      });
    });

    it('filters non-audio files', async () => {
      mockSend.mockResolvedValueOnce({
        Contents: [
          { Key: 'sounds/audio.mp3', Size: 1024, LastModified: new Date() },
          { Key: 'sounds/readme.txt', Size: 100, LastModified: new Date() },
          { Key: 'sounds/music.ogg', Size: 2048, LastModified: new Date() },
        ],
      });

      const { listSounds } = require('@rainbot/utils/storage');
      const sounds = await listSounds();

      expect(sounds).toHaveLength(2);
      expect(sounds.map((s: { name: string }) => s.name)).toEqual(['audio.mp3', 'music.ogg']);
    });

    it('handles S3 errors', async () => {
      mockSend.mockRejectedValueOnce(new Error('S3 Error'));

      const { listSounds } = require('@rainbot/utils/storage');

      await expect(listSounds()).rejects.toThrow('S3 Error');
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('getSoundStream', () => {
    it('throws error when storage is not configured', async () => {
      (mockConfig as any).storageBucketName = undefined;
      const { getSoundStream } = require('@rainbot/utils/storage');

      await expect(getSoundStream('test.mp3')).rejects.toThrow('Storage not configured');
    });

    it('returns readable stream for sound file', async () => {
      const mockStream = Readable.from(['test data']);
      mockSend.mockResolvedValueOnce({
        Body: mockStream,
      });

      const { getSoundStream } = require('@rainbot/utils/storage');
      const stream = await getSoundStream('test.mp3');

      expect(stream).toBeInstanceOf(Readable);
    });

    it('throws error when sound not found', async () => {
      const error: any = new Error('NoSuchKey');
      error.name = 'NoSuchKey';
      mockSend.mockRejectedValueOnce(error);

      const { getSoundStream } = require('@rainbot/utils/storage');

      await expect(getSoundStream('missing.mp3')).rejects.toThrow('Sound not found: missing.mp3');
    });

    it('handles 404 errors', async () => {
      const error: any = new Error('Not Found');
      error.$metadata = { httpStatusCode: 404 };
      mockSend.mockRejectedValueOnce(error);

      const { getSoundStream } = require('@rainbot/utils/storage');

      await expect(getSoundStream('missing.mp3')).rejects.toThrow('Sound not found: missing.mp3');
    });
  });

  describe('uploadSound', () => {
    it('throws error when storage is not configured', async () => {
      (mockConfig as any).storageBucketName = undefined;
      const { uploadSound } = require('@rainbot/utils/storage');

      const mockStream = (async function* () {
        yield Buffer.from('test');
      })();

      await expect(uploadSound(mockStream, 'test.mp3')).rejects.toThrow('Storage not configured');
    });

    it('uploads sound file to S3', async () => {
      mockSend.mockResolvedValueOnce({});

      const { uploadSound } = require('@rainbot/utils/storage');

      const mockStream = (async function* () {
        yield Buffer.from('test data');
      })();

      const key = await uploadSound(mockStream, 'new-sound.mp3');

      expect(key).toBe('new-sound.mp3');
      expect(mockSend).toHaveBeenCalled();
    });

    it('handles upload errors', async () => {
      mockSend.mockRejectedValueOnce(new Error('Upload failed'));

      const { uploadSound } = require('@rainbot/utils/storage');

      const mockStream = (async function* () {
        yield Buffer.from('test');
      })();

      await expect(uploadSound(mockStream, 'test.mp3')).rejects.toThrow('Upload failed');
    });
  });

  describe('deleteSound', () => {
    it('throws error when storage is not configured', async () => {
      (mockConfig as any).storageBucketName = undefined;
      const { deleteSound } = require('@rainbot/utils/storage');

      await expect(deleteSound('test.mp3')).rejects.toThrow('Storage not configured');
    });

    it('deletes sound file from S3', async () => {
      mockSend.mockResolvedValueOnce({});

      const { deleteSound } = require('@rainbot/utils/storage');
      await deleteSound('test.mp3');

      expect(mockSend).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Deleted'));
    });

    it('handles delete errors', async () => {
      mockSend.mockRejectedValueOnce(new Error('Delete failed'));

      const { deleteSound } = require('@rainbot/utils/storage');

      await expect(deleteSound('test.mp3')).rejects.toThrow('Delete failed');
    });
  });

  describe('soundExists', () => {
    it('returns false when storage is not configured', async () => {
      (mockConfig as any).storageBucketName = undefined;
      const { soundExists } = require('@rainbot/utils/storage');

      const exists = await soundExists('test.mp3');

      expect(exists).toBe(false);
    });

    it('returns true when sound exists', async () => {
      mockSend.mockResolvedValueOnce({});

      const { soundExists } = require('@rainbot/utils/storage');
      const exists = await soundExists('test.mp3');

      expect(exists).toBe(true);
    });

    it('returns false when sound does not exist', async () => {
      const error: any = new Error('NotFound');
      error.name = 'NotFound';
      mockSend.mockRejectedValueOnce(error);

      const { soundExists } = require('@rainbot/utils/storage');
      const exists = await soundExists('missing.mp3');

      expect(exists).toBe(false);
    });

    it('returns false on 404 errors', async () => {
      const error: any = new Error('Not Found');
      error.$metadata = { httpStatusCode: 404 };
      mockSend.mockRejectedValueOnce(error);

      const { soundExists } = require('@rainbot/utils/storage');
      const exists = await soundExists('missing.mp3');

      expect(exists).toBe(false);
    });

    it('throws on other errors', async () => {
      mockSend.mockRejectedValueOnce(new Error('Network error'));

      const { soundExists } = require('@rainbot/utils/storage');

      await expect(soundExists('test.mp3')).rejects.toThrow('Network error');
    });
  });
});

/**
 * Builds a structurally valid Ogg page wrapping `payload`, so these tests
 * exercise real container parsing rather than a hand-waved byte blob.
 */
function oggPage(payload: Buffer): Buffer {
  const segments: number[] = [];
  let remaining = payload.length;
  while (remaining >= 255) {
    segments.push(255);
    remaining -= 255;
  }
  segments.push(remaining);

  const header = Buffer.alloc(27 + segments.length);
  header.write('OggS', 0, 'latin1');
  header[4] = 0;
  header[5] = 2;
  header[26] = segments.length;
  Buffer.from(segments).copy(header, 27);

  return Buffer.concat([header, payload]);
}

const oggOpusBytes = oggPage(
  Buffer.concat([Buffer.from('OpusHead', 'latin1'), Buffer.from([1, 2, 0x38, 0x01, 0x80, 0xbb])])
);
const oggVorbisBytes = oggPage(
  Buffer.concat([Buffer.from([0x01]), Buffer.from('vorbis', 'latin1'), Buffer.alloc(23)])
);

describe('soundNeedsOpusConversion', () => {
  it('converts an .ogg that actually holds Vorbis, not Opus', () => {
    const { soundNeedsOpusConversion } = require('@rainbot/utils/storage');

    expect(soundNeedsOpusConversion('yougay.ogg', oggVorbisBytes)).toBe(true);
  });

  it('leaves a genuine Ogg Opus object alone', () => {
    const { soundNeedsOpusConversion } = require('@rainbot/utils/storage');

    expect(soundNeedsOpusConversion('airhorn.ogg', oggOpusBytes)).toBe(false);
  });

  it('converts when no object exists at the destination yet', () => {
    const { soundNeedsOpusConversion } = require('@rainbot/utils/storage');

    expect(soundNeedsOpusConversion('airhorn.ogg', null)).toBe(true);
  });

  it('never converts voice recordings', () => {
    const { soundNeedsOpusConversion } = require('@rainbot/utils/storage');

    expect(soundNeedsOpusConversion('records/123-456.raw', null)).toBe(false);
    expect(soundNeedsOpusConversion('records/123-456.raw', oggVorbisBytes)).toBe(false);
  });
});

describe('backupSound', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockConfig.storageBucketName = 'test-bucket';
    mockConfig.storageAccessKey = 'test-access-key';
    mockConfig.storageSecretKey = 'test-secret-key';
    mockConfig.storageEndpoint = 'https://s3.example.com';
    jest.resetModules();
  });

  it('copies the object under archived/ and leaves the original in place', async () => {
    const { CopyObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
    mockSend.mockResolvedValueOnce({});

    const { backupSound } = require('@rainbot/utils/storage');
    await backupSound('yougay.ogg');

    expect(CopyObjectCommand).toHaveBeenCalledWith({
      Bucket: 'test-bucket',
      CopySource: 'test-bucket/sounds/yougay.ogg',
      Key: 'sounds/archived/yougay.ogg',
    });
    expect(DeleteObjectCommand).not.toHaveBeenCalled();
  });

  it('percent-encodes the copy source so awkward filenames survive', async () => {
    const { CopyObjectCommand } = require('@aws-sdk/client-s3');
    mockSend.mockResolvedValueOnce({});

    const { backupSound } = require('@rainbot/utils/storage');
    await backupSound('pissin noyaballs.ogg');

    expect(CopyObjectCommand).toHaveBeenCalledWith({
      Bucket: 'test-bucket',
      CopySource: 'test-bucket/sounds/pissin%20noyaballs.ogg',
      Key: 'sounds/archived/pissin noyaballs.ogg',
    });
  });

  it('refuses to report success when storage is not configured', async () => {
    (mockConfig as any).storageBucketName = undefined;

    const { backupSound } = require('@rainbot/utils/storage');

    await expect(backupSound('yougay.ogg')).rejects.toThrow('Storage not configured');
  });
});

describe('readSoundHead', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockConfig.storageBucketName = 'test-bucket';
    mockConfig.storageAccessKey = 'test-access-key';
    mockConfig.storageSecretKey = 'test-secret-key';
    mockConfig.storageEndpoint = 'https://s3.example.com';
    jest.resetModules();
  });

  it('requests only the leading bytes of the object', async () => {
    const { GetObjectCommand } = require('@aws-sdk/client-s3');
    mockSend.mockResolvedValueOnce({ Body: Readable.from([Buffer.from('OggS')]) });

    const { readSoundHead } = require('@rainbot/utils/storage');
    const head = await readSoundHead('yougay.ogg');

    expect(GetObjectCommand).toHaveBeenCalledWith({
      Bucket: 'test-bucket',
      Key: 'sounds/yougay.ogg',
      Range: 'bytes=0-8191',
    });
    expect(head).toEqual(Buffer.from('OggS'));
  });

  it('returns null when the object is missing', async () => {
    const error: any = new Error('NoSuchKey');
    error.name = 'NoSuchKey';
    mockSend.mockRejectedValueOnce(error);

    const { readSoundHead } = require('@rainbot/utils/storage');

    await expect(readSoundHead('gone.ogg')).resolves.toBeNull();
  });

  it('returns null when storage is not configured', async () => {
    (mockConfig as any).storageBucketName = undefined;

    const { readSoundHead } = require('@rainbot/utils/storage');

    await expect(readSoundHead('yougay.ogg')).resolves.toBeNull();
  });
});
