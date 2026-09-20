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

/**
 * Builds one Ogg page around `payload`.
 *
 * `bos` sets the beginning-of-stream flag in byte 5, which is what marks a page
 * as a logical stream's identification page - the only place the detector looks
 * for a codec id.
 */
function oggPage(payload: Buffer, bos = true): Buffer {
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
  header[5] = bos ? 0x02 : 0x00;
  header[26] = segments.length;
  Buffer.from(segments).copy(header, 27);

  return Buffer.concat([header, payload]);
}

const OPUS_HEAD = Buffer.concat([
  Buffer.from('OpusHead', 'latin1'),
  Buffer.from([1, 1, 0x38, 0x01, 0x80, 0xbb, 0, 0, 0, 0, 0]),
]);

/** The Theora identification packet: 0x80 then the codec name. */
const THEORA_HEAD = Buffer.concat([
  Buffer.from('\x80theora', 'latin1'),
  Buffer.from([3, 2, 1, 0, 0x14, 0, 0x0f, 0, 1, 0x40]),
]);

/**
 * The affected library objects: a Theora identification page, then an Opus one,
 * then audio data. Mirrors ffmpeg's own layout, where `theora` lands at byte 29
 * and `OpusHead` at 98.
 */
const OGG_THEORA_OPUS = Buffer.concat([
  oggPage(THEORA_HEAD),
  oggPage(OPUS_HEAD),
  oggPage(Buffer.alloc(64, 9), false),
]);

/** A healthy audio-only clip. */
const OGG_OPUS = Buffer.concat([oggPage(OPUS_HEAD), oggPage(Buffer.alloc(64, 9), false)]);

/**
 * Audio-only, but with the word `theora` in a comment packet - a clip someone
 * ripped from a video and tagged as such. A head scan for the bare string
 * reports this as video; it is not.
 */
const OGG_OPUS_TAGGED_THEORA = Buffer.concat([
  oggPage(OPUS_HEAD),
  oggPage(
    Buffer.concat([
      Buffer.from('OpusTags', 'latin1'),
      Buffer.from('theora tools 1.2 - ripped from a theora video', 'latin1'),
    ]),
    false
  ),
]);

/** A stand-in ffmpeg that emits `output` on stdout and exits with `code`. */
function fakeFfmpeg(output: Buffer, code = 0) {
  const child = new EventEmitter() as any;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.stdin = new EventEmitter() as any;
  child.stdin.write = jest.fn();
  child.stdin.end = jest.fn();

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
  // The re-mux shells out to ffmpeg, which is disabled under jest by default.
  // These tests drive it deliberately, with ffmpeg itself stubbed out.
  process.env['RAINBOT_TEST_TRANSCODE'] = '1';
  jest.resetModules();
  return require('@rainbot/utils/storage');
}

describe('soundHasVideoStream', () => {
  const { soundHasVideoStream } = require('@rainbot/utils/storage');

  it('finds the Theora stream in a clip that carries one', () => {
    expect(soundHasVideoStream(OGG_THEORA_OPUS)).toBe(true);
  });

  it('finds it whichever order the identification pages come in', () => {
    // Ogg does not fix the order of the beginning-of-stream pages, so a
    // detector that only looked at the first page would miss this one.
    const audioFirst = Buffer.concat([
      oggPage(OPUS_HEAD),
      oggPage(THEORA_HEAD),
      oggPage(Buffer.alloc(64, 9), false),
    ]);
    expect(soundHasVideoStream(audioFirst)).toBe(true);
  });

  it('finds the other video codecs Ogg is known to carry', () => {
    for (const id of ['\x80daala', 'OVP80', '\x01video\0', 'BBCD']) {
      const file = Buffer.concat([
        oggPage(Buffer.concat([Buffer.from(id, 'latin1'), Buffer.alloc(16, 1)])),
        oggPage(OPUS_HEAD),
      ]);
      expect(soundHasVideoStream(file)).toBe(true);
    }
  });

  it('leaves a healthy audio-only clip alone', () => {
    expect(soundHasVideoStream(OGG_OPUS)).toBe(false);
  });

  it('is not fooled by the word theora inside a comment packet', () => {
    // The whole reason the detector walks pages instead of scanning the head
    // for the string: this clip has no video stream at all, and a substring
    // match would send it through a needless rewrite.
    expect(OGG_OPUS_TAGGED_THEORA.includes('theora', 0, 'latin1')).toBe(true);
    expect(soundHasVideoStream(OGG_OPUS_TAGGED_THEORA)).toBe(false);
  });

  it('says no for anything that is not an Ogg file, and for no bytes at all', () => {
    expect(soundHasVideoStream(null)).toBe(false);
    expect(soundHasVideoStream(Buffer.alloc(0))).toBe(false);
    expect(soundHasVideoStream(Buffer.from('ID3\x04data and more data', 'latin1'))).toBe(false);
    expect(soundHasVideoStream(Buffer.from('RIFF....WAVEfmt theora', 'latin1'))).toBe(false);
  });

  it('says no rather than guessing when a page runs past the bytes it was given', () => {
    const truncated = OGG_THEORA_OPUS.subarray(0, 20);
    expect(soundHasVideoStream(truncated)).toBe(false);
  });
});

describe('sweepStripSoundVideo', () => {
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

  it('archives the original before rewriting it in place', async () => {
    mockSpawn.mockImplementation(() => fakeFfmpeg(OGG_OPUS));

    mockSend
      .mockResolvedValueOnce({ Contents: [{ Key: 'sounds/1-08_Douchebag.ogg', Size: 179297 }] })
      .mockResolvedValueOnce({ Body: OGG_THEORA_OPUS }) // readSoundHead
      .mockResolvedValueOnce({ Body: OGG_THEORA_OPUS }) // full object for the re-mux
      .mockResolvedValueOnce({}) // archive copy
      .mockResolvedValueOnce({}); // rewrite

    const { sweepStripSoundVideo } = loadStorage();
    const result = await sweepStripSoundVideo();

    expect(result).toEqual({ stripped: 1, archived: 1, skipped: 0, failed: 0 });
    // The Copy precedes the Put: the backup exists before anything is
    // overwritten, so a bad re-mux is recoverable.
    expect(sentCommands()).toEqual([
      'List sounds/',
      'Get sounds/1-08_Douchebag.ogg',
      'Get sounds/1-08_Douchebag.ogg',
      'Copy sounds/archived/1-08_Douchebag.ogg',
      'Put sounds/1-08_Douchebag.ogg',
    ]);

    const { PutObjectCommand } = require('@aws-sdk/client-s3');
    expect(PutObjectCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        // Same key: the soundboard, customizations and analysis rows all key
        // off the filename.
        Key: 'sounds/1-08_Douchebag.ogg',
        Body: OGG_OPUS,
        ContentType: 'audio/ogg',
      })
    );
  });

  it('drops the video stream without re-encoding the audio', async () => {
    mockSpawn.mockImplementation(() => fakeFfmpeg(OGG_OPUS));

    mockSend
      .mockResolvedValueOnce({ Contents: [{ Key: 'sounds/clip.ogg', Size: 10 }] })
      .mockResolvedValueOnce({ Body: OGG_THEORA_OPUS })
      .mockResolvedValueOnce({ Body: OGG_THEORA_OPUS })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});

    const { sweepStripSoundVideo } = loadStorage();
    await sweepStripSoundVideo();

    expect(mockSpawn).toHaveBeenCalledWith('ffmpeg', [
      '-hide_banner',
      '-loglevel',
      'error',
      '-i',
      'pipe:0',
      '-vn',
      // A stream copy, not `libopus`: the audio packets come out bit-for-bit
      // as they went in, so the clip is untouched and the sweep is cheap.
      '-c:a',
      'copy',
      '-f',
      'ogg',
      'pipe:1',
    ]);
  });

  it('leaves an audio-only clip completely untouched', async () => {
    mockSend
      .mockResolvedValueOnce({ Contents: [{ Key: 'sounds/airhorn.ogg', Size: 10 }] })
      .mockResolvedValueOnce({ Body: OGG_OPUS });

    const { sweepStripSoundVideo } = loadStorage();
    const result = await sweepStripSoundVideo();

    expect(result).toEqual({ stripped: 0, archived: 0, skipped: 1, failed: 0 });
    // One ranged read and nothing else: no download, no ffmpeg, no write.
    expect(sentCommands()).toEqual(['List sounds/', 'Get sounds/airhorn.ogg']);
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it('is a no-op on a second run, because the rewrite has no video left', async () => {
    mockSpawn.mockImplementation(() => fakeFfmpeg(OGG_OPUS));

    mockSend
      .mockResolvedValueOnce({ Contents: [{ Key: 'sounds/clip.ogg', Size: 10 }] })
      .mockResolvedValueOnce({ Body: OGG_THEORA_OPUS })
      .mockResolvedValueOnce({ Body: OGG_THEORA_OPUS })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});

    const { sweepStripSoundVideo } = loadStorage();
    expect(await sweepStripSoundVideo()).toEqual({
      stripped: 1,
      archived: 1,
      skipped: 0,
      failed: 0,
    });

    mockSend.mockReset();
    mockSpawn.mockClear();
    // The object now holds what the first run wrote.
    mockSend
      .mockResolvedValueOnce({ Contents: [{ Key: 'sounds/clip.ogg', Size: 10 }] })
      .mockResolvedValueOnce({ Body: OGG_OPUS });

    expect(await sweepStripSoundVideo()).toEqual({
      stripped: 0,
      archived: 0,
      skipped: 1,
      failed: 0,
    });
    expect(sentCommands()).toEqual(['List sounds/', 'Get sounds/clip.ogg']);
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it('stops after `limit` objects', async () => {
    mockSpawn.mockImplementation(() => fakeFfmpeg(OGG_OPUS));

    mockSend
      .mockResolvedValueOnce({
        Contents: [
          { Key: 'sounds/one.ogg', Size: 10 },
          { Key: 'sounds/two.ogg', Size: 10 },
          { Key: 'sounds/three.ogg', Size: 10 },
        ],
      })
      .mockResolvedValueOnce({ Body: OGG_THEORA_OPUS })
      .mockResolvedValueOnce({ Body: OGG_THEORA_OPUS })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});

    const { sweepStripSoundVideo } = loadStorage();
    const result = await sweepStripSoundVideo({ limit: 1 });

    expect(result).toEqual({ stripped: 1, archived: 1, skipped: 0, failed: 0 });
    // `limit` counts objects looked at, not objects rewritten, so the other two
    // are never even read.
    expect(sentCommands()).not.toContain('Get sounds/two.ogg');
    expect(sentCommands()).not.toContain('Get sounds/three.ogg');
  });

  it('reports what it would do without writing anything, under dryRun', async () => {
    mockSend
      .mockResolvedValueOnce({
        Contents: [
          { Key: 'sounds/clip.ogg', Size: 10 },
          { Key: 'sounds/airhorn.ogg', Size: 10 },
        ],
      })
      .mockResolvedValueOnce({ Body: OGG_THEORA_OPUS })
      .mockResolvedValueOnce({ Body: OGG_OPUS });

    const { sweepStripSoundVideo } = loadStorage();
    const result = await sweepStripSoundVideo({ dryRun: true });

    expect(result).toEqual({ stripped: 1, archived: 0, skipped: 1, failed: 0 });
    expect(sentCommands()).toEqual([
      'List sounds/',
      'Get sounds/clip.ogg',
      'Get sounds/airhorn.ogg',
    ]);
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it('leaves the stored object alone when ffmpeg fails', async () => {
    mockSpawn.mockImplementation(() => fakeFfmpeg(Buffer.alloc(0), 1));

    mockSend
      .mockResolvedValueOnce({ Contents: [{ Key: 'sounds/clip.ogg', Size: 10 }] })
      .mockResolvedValueOnce({ Body: OGG_THEORA_OPUS })
      .mockResolvedValueOnce({ Body: OGG_THEORA_OPUS })
      .mockResolvedValueOnce({});

    const { sweepStripSoundVideo } = loadStorage();
    const result = await sweepStripSoundVideo();

    // The archive copy was already taken, and the failure is counted as one
    // rather than swallowed into a success.
    expect(result).toEqual({ stripped: 0, archived: 1, skipped: 0, failed: 1 });
    expect(sentCommands()).not.toContain('Put sounds/clip.ogg');
  });

  it('refuses to write back output that is no longer a playable container', async () => {
    // A stream copy that dropped the audio as well, or emitted something the
    // soundboard's demuxers cannot read, would otherwise be written straight
    // over a clip that at least played.
    mockSpawn.mockImplementation(() => fakeFfmpeg(Buffer.from('not an ogg file at all', 'latin1')));

    mockSend
      .mockResolvedValueOnce({ Contents: [{ Key: 'sounds/clip.ogg', Size: 10 }] })
      .mockResolvedValueOnce({ Body: OGG_THEORA_OPUS })
      .mockResolvedValueOnce({ Body: OGG_THEORA_OPUS })
      .mockResolvedValueOnce({});

    const { sweepStripSoundVideo } = loadStorage();
    const result = await sweepStripSoundVideo();

    expect(result).toEqual({ stripped: 0, archived: 1, skipped: 0, failed: 1 });
    expect(sentCommands()).not.toContain('Put sounds/clip.ogg');
  });

  it('refuses to write back output that still declares a video stream', async () => {
    mockSpawn.mockImplementation(() => fakeFfmpeg(OGG_THEORA_OPUS));

    mockSend
      .mockResolvedValueOnce({ Contents: [{ Key: 'sounds/clip.ogg', Size: 10 }] })
      .mockResolvedValueOnce({ Body: OGG_THEORA_OPUS })
      .mockResolvedValueOnce({ Body: OGG_THEORA_OPUS })
      .mockResolvedValueOnce({});

    const { sweepStripSoundVideo } = loadStorage();
    const result = await sweepStripSoundVideo();

    expect(result).toEqual({ stripped: 0, archived: 1, skipped: 0, failed: 1 });
    expect(sentCommands()).not.toContain('Put sounds/clip.ogg');
  });

  it('keeps going through the rest of the library after one object fails', async () => {
    mockSpawn
      .mockImplementationOnce(() => fakeFfmpeg(Buffer.alloc(0), 1))
      .mockImplementationOnce(() => fakeFfmpeg(OGG_OPUS));

    mockSend
      .mockResolvedValueOnce({
        Contents: [
          { Key: 'sounds/broken.ogg', Size: 10 },
          { Key: 'sounds/fine.ogg', Size: 10 },
        ],
      })
      .mockResolvedValueOnce({ Body: OGG_THEORA_OPUS }) // broken: head
      .mockResolvedValueOnce({ Body: OGG_THEORA_OPUS }) // broken: object
      .mockResolvedValueOnce({}) // broken: archive
      .mockResolvedValueOnce({ Body: OGG_THEORA_OPUS }) // fine: head
      .mockResolvedValueOnce({ Body: OGG_THEORA_OPUS }) // fine: object
      .mockResolvedValueOnce({}) // fine: archive
      .mockResolvedValueOnce({}); // fine: rewrite

    const { sweepStripSoundVideo } = loadStorage();
    const result = await sweepStripSoundVideo();

    expect(result).toEqual({ stripped: 1, archived: 2, skipped: 0, failed: 1 });
    expect(sentCommands()).toContain('Put sounds/fine.ogg');
    expect(sentCommands()).not.toContain('Put sounds/broken.ogg');
  });

  it('never deletes anything', async () => {
    mockSpawn.mockImplementation(() => fakeFfmpeg(OGG_OPUS));

    mockSend
      .mockResolvedValueOnce({ Contents: [{ Key: 'sounds/clip.ogg', Size: 10 }] })
      .mockResolvedValueOnce({ Body: OGG_THEORA_OPUS })
      .mockResolvedValueOnce({ Body: OGG_THEORA_OPUS })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});

    const { sweepStripSoundVideo } = loadStorage();
    await sweepStripSoundVideo();

    // Source and destination are the same key here, so there is no "original"
    // left to discard - the archive copy is the only backup and it stays.
    expect(sentCommands().some((command) => command.startsWith('Delete '))).toBe(false);
  });
});
