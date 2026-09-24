import { StreamType } from '@discordjs/voice';
import { Readable } from 'stream';
import {
  AUDIO_SNIFF_BYTES,
  detectStreamTypeFromHeader,
  isOpusContainer,
  sniffSoundStream,
} from '../audioSniff';

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
  header[4] = 0; // stream structure version
  header[5] = 2; // header type: beginning of stream
  header[26] = segments.length;
  Buffer.from(segments).copy(header, 27);

  return Buffer.concat([header, payload]);
}

const OPUS_HEAD = Buffer.concat([
  Buffer.from('OpusHead', 'latin1'),
  Buffer.from([1, 2, 0x38, 0x01, 0x80, 0xbb, 0, 0, 0, 0, 0]),
]);
const VORBIS_HEAD = Buffer.concat([
  Buffer.from([0x01]),
  Buffer.from('vorbis', 'latin1'),
  Buffer.alloc(23),
]);

const oggOpus = oggPage(OPUS_HEAD);
const oggVorbis = oggPage(VORBIS_HEAD);
const mp3 = Buffer.concat([Buffer.from([0xff, 0xfb, 0x90, 0x44]), Buffer.alloc(64)]);
const webmOpus = Buffer.concat([
  Buffer.from([0x1a, 0x45, 0xdf, 0xa3]),
  Buffer.alloc(200),
  Buffer.from('A_OPUS', 'latin1'),
  Buffer.alloc(64),
]);
const webmVorbis = Buffer.concat([
  Buffer.from([0x1a, 0x45, 0xdf, 0xa3]),
  Buffer.alloc(200),
  Buffer.from('A_VORBIS', 'latin1'),
  Buffer.alloc(64),
]);

describe('detectStreamTypeFromHeader', () => {
  it('reports Ogg Opus for an Ogg page carrying an OpusHead packet', () => {
    expect(detectStreamTypeFromHeader(oggOpus)).toBe(StreamType.OggOpus);
  });

  it('reports Arbitrary for an Ogg page carrying Vorbis, not Opus', () => {
    expect(detectStreamTypeFromHeader(oggVorbis)).toBe(StreamType.Arbitrary);
  });

  it('reports WebM Opus only when the WebM CodecID is A_OPUS', () => {
    expect(detectStreamTypeFromHeader(webmOpus)).toBe(StreamType.WebmOpus);
    expect(detectStreamTypeFromHeader(webmVorbis)).toBe(StreamType.Arbitrary);
  });

  it('reports Arbitrary for non-Ogg, non-WebM audio', () => {
    expect(detectStreamTypeFromHeader(mp3)).toBe(StreamType.Arbitrary);
  });

  it('reports Arbitrary for empty or truncated headers', () => {
    expect(detectStreamTypeFromHeader(Buffer.alloc(0))).toBe(StreamType.Arbitrary);
    expect(detectStreamTypeFromHeader(Buffer.from('Ogg', 'latin1'))).toBe(StreamType.Arbitrary);
    expect(detectStreamTypeFromHeader(oggOpus.subarray(0, 20))).toBe(StreamType.Arbitrary);
  });

  it('does not mistake an "OpusHead" string in Vorbis metadata for real Opus', () => {
    const decoy = oggPage(Buffer.concat([VORBIS_HEAD, Buffer.from('OpusHead', 'latin1')]));
    expect(detectStreamTypeFromHeader(decoy)).toBe(StreamType.Arbitrary);
  });
});

describe('isOpusContainer', () => {
  it('is true only for containers the Opus demuxers can actually read', () => {
    expect(isOpusContainer(oggOpus)).toBe(true);
    expect(isOpusContainer(webmOpus)).toBe(true);
    expect(isOpusContainer(oggVorbis)).toBe(false);
    expect(isOpusContainer(mp3)).toBe(false);
  });
});

describe('sniffSoundStream', () => {
  it('classifies an Ogg Vorbis stream as Arbitrary so ffmpeg decodes it', async () => {
    const body = Buffer.concat([oggVorbis, Buffer.alloc(1024, 7)]);
    const { stream, inputType } = await sniffSoundStream(Readable.from([body]));

    expect(inputType).toBe(StreamType.Arbitrary);
    await expect(collect(stream)).resolves.toEqual(body);
  });

  it('classifies an Ogg Opus stream as OggOpus and replays every byte', async () => {
    const body = Buffer.concat([oggOpus, Buffer.alloc(AUDIO_SNIFF_BYTES * 2, 3)]);
    const { stream, inputType } = await sniffSoundStream(Readable.from([body]));

    expect(inputType).toBe(StreamType.OggOpus);
    await expect(collect(stream)).resolves.toEqual(body);
  });

  it('handles a source shorter than the sniff window without losing data', async () => {
    const { stream, inputType } = await sniffSoundStream(Readable.from([oggOpus]));

    expect(inputType).toBe(StreamType.OggOpus);
    await expect(collect(stream)).resolves.toEqual(oggOpus);
  });

  it('handles an empty source', async () => {
    const { stream, inputType } = await sniffSoundStream(Readable.from([]));

    expect(inputType).toBe(StreamType.Arbitrary);
    await expect(collect(stream)).resolves.toEqual(Buffer.alloc(0));
  });

  it('propagates a source error to the returned stream', async () => {
    const source = new Readable({
      read() {
        this.destroy(new Error('s3 went away'));
      },
    });
    const { stream } = await sniffSoundStream(source);

    await expect(collect(stream)).rejects.toThrow('s3 went away');
  });
});

async function collect(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk as Buffer));
  }
  return Buffer.concat(chunks);
}
