/* eslint-disable @typescript-eslint/no-explicit-any */
import { EventEmitter } from 'events';

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

const mockSend = jest.fn();

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn(() => ({ send: mockSend })),
  ListObjectsV2Command: jest.fn((input) => ({ __type: 'List', input })),
  GetObjectCommand: jest.fn((input) => ({ __type: 'Get', input })),
  PutObjectCommand: jest.fn((input) => ({ __type: 'Put', input })),
  DeleteObjectCommand: jest.fn((input) => ({ __type: 'Delete', input })),
  HeadObjectCommand: jest.fn((input) => ({ __type: 'Head', input })),
  CopyObjectCommand: jest.fn((input) => ({ __type: 'Copy', input })),
}));

// Hoisted so it survives the jest.resetModules() each test does before
// re-requiring storage - a factory-local jest.fn() would be rebuilt empty.
const mockSpawn = jest.fn();

jest.mock('child_process', () => ({
  spawn: mockSpawn,
}));

/** Builds a structurally valid Ogg page wrapping `payload`. */
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

const OGG_OPUS = oggPage(
  Buffer.concat([Buffer.from('OpusHead', 'latin1'), Buffer.from([1, 2, 0x38, 0x01, 0x80, 0xbb])])
);
const OGG_VORBIS = oggPage(
  Buffer.concat([Buffer.from([0x01]), Buffer.from('vorbis', 'latin1'), Buffer.alloc(23)])
);

/**
 * A stdin that can fail the way a real one does.
 *
 * `{ write: jest.fn(), end: jest.fn() }` can never emit, so an ffmpeg that
 * exits before draining stdin - which is what a malformed input produces -
 * looked harmless here. An EventEmitter lets a test raise the EPIPE for real,
 * and `emit('error')` with no listener throws, which is exactly the unhandled
 * 'error' event that would kill the process.
 */
function fakeStdin() {
  const stdin = new EventEmitter() as any;
  stdin.write = jest.fn();
  stdin.end = jest.fn();
  return stdin;
}

/** A stand-in ffmpeg that emits `output` on stdout and exits with `code`. */
function fakeFfmpeg(output: Buffer, code = 0) {
  const child = new EventEmitter() as any;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.stdin = fakeStdin();

  process.nextTick(() => {
    if (code === 0 && output.length > 0) child.stdout.emit('data', output);
    child.emit('close', code);
  });

  return child;
}

/** Records every command the code sent, in order, as `TYPE key` strings. */
function sentCommands(): string[] {
  return mockSend.mock.calls.map(([command]) => {
    const key = command.input?.Key ?? command.input?.Prefix ?? '';
    return `${command.__type} ${key}`;
  });
}

function loadStorage() {
  // Transcoding shells out to ffmpeg, so it is disabled under jest by default.
  // These tests drive it deliberately, with ffmpeg itself stubbed out.
  process.env['RAINBOT_TEST_TRANSCODE'] = '1';
  jest.resetModules();
  return require('@rainbot/utils/storage');
}

describe('sweepTranscodeSounds', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // clearAllMocks leaves queued `mockResolvedValueOnce` responses in place,
    // so an unconsumed one would leak into the next test.
    mockSend.mockReset();
    mockSpawn.mockReset();
  });

  afterEach(() => {
    delete process.env['RAINBOT_TEST_TRANSCODE'];
  });

  it('rewrites an .ogg holding Vorbis in place, keeping the original bytes', async () => {
    mockSpawn.mockImplementation(() => fakeFfmpeg(OGG_OPUS));

    mockSend
      .mockResolvedValueOnce({ Contents: [{ Key: 'sounds/yougay.ogg', Size: 10 }] }) // listSounds
      .mockResolvedValueOnce({ Body: OGG_VORBIS }) // readSoundHead of the destination
      .mockResolvedValueOnce({}) // backup copy to archived/
      .mockResolvedValueOnce({ Body: OGG_VORBIS }) // read the source to transcode
      .mockResolvedValueOnce({}) // write the converted object
      .mockResolvedValueOnce({}); // soundExists confirmation

    const { sweepTranscodeSounds } = loadStorage();
    const result = await sweepTranscodeSounds();

    expect(result).toEqual({ converted: 1, deleted: 0, skipped: 0 });
    expect(sentCommands()).toEqual([
      'List sounds/',
      'Get sounds/yougay.ogg',
      'Copy sounds/archived/yougay.ogg',
      'Get sounds/yougay.ogg',
      'Put sounds/yougay.ogg',
      'Head sounds/yougay.ogg',
    ]);

    const { PutObjectCommand } = require('@aws-sdk/client-s3');
    expect(PutObjectCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        Key: 'sounds/yougay.ogg',
        Body: OGG_OPUS,
        ContentType: 'audio/ogg',
      })
    );
  });

  it('leaves a genuine Ogg Opus clip completely untouched', async () => {
    mockSend
      .mockResolvedValueOnce({ Contents: [{ Key: 'sounds/airhorn.ogg', Size: 10 }] })
      .mockResolvedValueOnce({ Body: OGG_OPUS });

    const { sweepTranscodeSounds } = loadStorage();
    const result = await sweepTranscodeSounds();

    expect(result).toEqual({ converted: 0, deleted: 0, skipped: 1 });
    expect(sentCommands()).toEqual(['List sounds/', 'Get sounds/airhorn.ogg']);
  });

  it('never deletes an in-place conversion, even with deleteOriginal set', async () => {
    mockSpawn.mockImplementation(() => fakeFfmpeg(OGG_OPUS));

    mockSend
      .mockResolvedValueOnce({ Contents: [{ Key: 'sounds/yougay.ogg', Size: 10 }] })
      .mockResolvedValueOnce({ Body: OGG_VORBIS })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ Body: OGG_VORBIS })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});

    const { sweepTranscodeSounds } = loadStorage();
    const result = await sweepTranscodeSounds({ deleteOriginal: true });

    // The source and destination are the same key here, so archiving would
    // delete the conversion that was just written.
    expect(result).toEqual({ converted: 1, deleted: 0, skipped: 0 });
    expect(sentCommands()).not.toContain('Delete sounds/yougay.ogg');
  });

  it('survives the EPIPE an early-exiting ffmpeg leaves on stdin', async () => {
    // ffmpeg that refuses a malformed input exits while the source is still
    // being written into its stdin, and the write then fails with EPIPE. With
    // no listener that is an unhandled 'error' event, which takes the whole
    // process down mid-sweep. Catching the throw here records any escape.
    const escaped: Error[] = [];

    mockSpawn.mockImplementation(() => {
      const child = fakeFfmpeg(Buffer.alloc(0), 1);
      process.nextTick(() => {
        try {
          child.stdin.emit('error', Object.assign(new Error('write EPIPE'), { code: 'EPIPE' }));
        } catch (error) {
          escaped.push(error as Error);
        }
      });
      return child;
    });

    mockSend
      .mockResolvedValueOnce({ Contents: [{ Key: 'sounds/yougay.ogg', Size: 10 }] })
      .mockResolvedValueOnce({ Body: OGG_VORBIS })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ Body: OGG_VORBIS });

    const { sweepTranscodeSounds } = loadStorage();
    const result = await sweepTranscodeSounds();
    await new Promise((resolve) => setImmediate(resolve));

    expect(escaped).toEqual([]);
    // The failure is still reported as a failure, not swallowed into success.
    expect(result).toEqual({ converted: 0, deleted: 0, skipped: 0 });
    expect(sentCommands()).not.toContain('Put sounds/yougay.ogg');
  });

  it('does not count a clip as converted when ffmpeg fails', async () => {
    mockSpawn.mockImplementation(() => fakeFfmpeg(Buffer.alloc(0), 1));

    mockSend
      .mockResolvedValueOnce({ Contents: [{ Key: 'sounds/yougay.ogg', Size: 10 }] })
      .mockResolvedValueOnce({ Body: OGG_VORBIS })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ Body: OGG_VORBIS });

    const { sweepTranscodeSounds } = loadStorage();
    const result = await sweepTranscodeSounds();

    expect(result).toEqual({ converted: 0, deleted: 0, skipped: 0 });
    // The broken object is still there, untouched - nothing was written over it.
    expect(sentCommands()).not.toContain('Put sounds/yougay.ogg');
  });
});
