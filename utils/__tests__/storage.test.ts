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

jest.mock('@utils/logger', () => ({
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

jest.mock('@utils/config', () => ({
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
      const { listSounds } = require('@utils/storage');

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

      const { listSounds } = require('@utils/storage');
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

      const { listSounds } = require('@utils/storage');
      const sounds = await listSounds();

      expect(sounds).toHaveLength(2);
      expect(sounds.map((s: { name: string }) => s.name)).toEqual(['audio.mp3', 'music.ogg']);
    });

    it('handles S3 errors', async () => {
      mockSend.mockRejectedValueOnce(new Error('S3 Error'));

      const { listSounds } = require('@utils/storage');

      await expect(listSounds()).rejects.toThrow('S3 Error');
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('getSoundStream', () => {
    it('throws error when storage is not configured', async () => {
      (mockConfig as any).storageBucketName = undefined;
      const { getSoundStream } = require('@utils/storage');

      await expect(getSoundStream('test.mp3')).rejects.toThrow('Storage not configured');
    });

    it('returns readable stream for sound file', async () => {
      const mockStream = Readable.from(['test data']);
      mockSend.mockResolvedValueOnce({
        Body: mockStream,
      });

      const { getSoundStream } = require('@utils/storage');
      const stream = await getSoundStream('test.mp3');

      expect(stream).toBeInstanceOf(Readable);
    });

    it('throws error when sound not found', async () => {
      const error: any = new Error('NoSuchKey');
      error.name = 'NoSuchKey';
      mockSend.mockRejectedValueOnce(error);

      const { getSoundStream } = require('@utils/storage');

      await expect(getSoundStream('missing.mp3')).rejects.toThrow('Sound not found: missing.mp3');
    });

    it('handles 404 errors', async () => {
      const error: any = new Error('Not Found');
      error.$metadata = { httpStatusCode: 404 };
      mockSend.mockRejectedValueOnce(error);

      const { getSoundStream } = require('@utils/storage');

      await expect(getSoundStream('missing.mp3')).rejects.toThrow('Sound not found: missing.mp3');
    });
  });

  describe('uploadSound', () => {
    it('throws error when storage is not configured', async () => {
      (mockConfig as any).storageBucketName = undefined;
      const { uploadSound } = require('@utils/storage');

      const mockStream = (async function* () {
        yield Buffer.from('test');
      })();

      await expect(uploadSound(mockStream, 'test.mp3')).rejects.toThrow('Storage not configured');
    });

    it('uploads sound file to S3', async () => {
      mockSend.mockResolvedValueOnce({});

      const { uploadSound } = require('@utils/storage');

      const mockStream = (async function* () {
        yield Buffer.from('test data');
      })();

      const key = await uploadSound(mockStream, 'new-sound.mp3');

      expect(key).toBe('new-sound.mp3');
      expect(mockSend).toHaveBeenCalled();
    });

    it('handles upload errors', async () => {
      mockSend.mockRejectedValueOnce(new Error('Upload failed'));

      const { uploadSound } = require('@utils/storage');

      const mockStream = (async function* () {
        yield Buffer.from('test');
      })();

      await expect(uploadSound(mockStream, 'test.mp3')).rejects.toThrow('Upload failed');
    });
  });

  describe('deleteSound', () => {
    it('throws error when storage is not configured', async () => {
      (mockConfig as any).storageBucketName = undefined;
      const { deleteSound } = require('@utils/storage');

      await expect(deleteSound('test.mp3')).rejects.toThrow('Storage not configured');
    });

    it('deletes sound file from S3', async () => {
      mockSend.mockResolvedValueOnce({});

      const { deleteSound } = require('@utils/storage');
      await deleteSound('test.mp3');

      expect(mockSend).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Deleted'));
    });

    it('handles delete errors', async () => {
      mockSend.mockRejectedValueOnce(new Error('Delete failed'));

      const { deleteSound } = require('@utils/storage');

      await expect(deleteSound('test.mp3')).rejects.toThrow('Delete failed');
    });
  });

  describe('soundExists', () => {
    it('returns false when storage is not configured', async () => {
      (mockConfig as any).storageBucketName = undefined;
      const { soundExists } = require('@utils/storage');

      const exists = await soundExists('test.mp3');

      expect(exists).toBe(false);
    });

    it('returns true when sound exists', async () => {
      mockSend.mockResolvedValueOnce({});

      const { soundExists } = require('@utils/storage');
      const exists = await soundExists('test.mp3');

      expect(exists).toBe(true);
    });

    it('returns false when sound does not exist', async () => {
      const error: any = new Error('NotFound');
      error.name = 'NotFound';
      mockSend.mockRejectedValueOnce(error);

      const { soundExists } = require('@utils/storage');
      const exists = await soundExists('missing.mp3');

      expect(exists).toBe(false);
    });

    it('returns false on 404 errors', async () => {
      const error: any = new Error('Not Found');
      error.$metadata = { httpStatusCode: 404 };
      mockSend.mockRejectedValueOnce(error);

      const { soundExists } = require('@utils/storage');
      const exists = await soundExists('missing.mp3');

      expect(exists).toBe(false);
    });

    it('throws on other errors', async () => {
      mockSend.mockRejectedValueOnce(new Error('Network error'));

      const { soundExists } = require('@utils/storage');

      await expect(soundExists('test.mp3')).rejects.toThrow('Network error');
    });
  });
});
