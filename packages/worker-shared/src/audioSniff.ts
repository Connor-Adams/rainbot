import { StreamType } from '@discordjs/voice';
import { PassThrough, Readable } from 'stream';

/**
 * How many leading bytes we inspect before deciding how to decode a clip.
 * One Ogg page is far smaller than this; WebM needs enough room for the
 * Tracks element carrying the CodecID.
 */
export const AUDIO_SNIFF_BYTES = 8192;

const OGG_MAGIC = 'OggS';
const OGG_HEADER_BYTES = 27;
const OGG_SEGMENT_COUNT_OFFSET = 26;
const EBML_MAGIC = 0x1a45dfa3;

/**
 * Decides how a soundboard clip should be decoded based on what the bytes
 * actually are, not what the filename claims.
 *
 * The file extension is not evidence: an `.ogg` file is just as likely to hold
 * Vorbis as Opus, and prism's OggDemuxer silently emits zero packets for
 * Vorbis - the clip plays as pure silence with no error anywhere. Anything we
 * cannot positively identify as Opus is handed to ffmpeg, which decodes it.
 */
export function detectStreamTypeFromHeader(head: Buffer): StreamType {
  if (head.length >= 4 && head.subarray(0, 4).toString('latin1') === OGG_MAGIC) {
    return isOggOpus(head) ? StreamType.OggOpus : StreamType.Arbitrary;
  }

  if (head.length >= 4 && head.readUInt32BE(0) === EBML_MAGIC) {
    return head.includes('A_OPUS', 0, 'latin1') ? StreamType.WebmOpus : StreamType.Arbitrary;
  }

  return StreamType.Arbitrary;
}

/** True when the bytes are in a container prism's Opus demuxers can read. */
export function isOpusContainer(head: Buffer): boolean {
  const type = detectStreamTypeFromHeader(head);
  return type === StreamType.OggOpus || type === StreamType.WebmOpus;
}

/**
 * Reads the head of `source` to classify it, then returns a stream that still
 * replays every byte - including the ones consumed while sniffing.
 */
export async function sniffSoundStream(
  source: Readable
): Promise<{ stream: Readable; inputType: StreamType }> {
  const out = new PassThrough();

  let head: Buffer = Buffer.alloc(0);
  try {
    head = await readHead(source, AUDIO_SNIFF_BYTES);
  } catch {
    // The failure is surfaced on `out` by forwardTo below.
  }

  if (head.length > 0) {
    out.write(head);
  }
  forwardTo(source, out);

  return { stream: out, inputType: detectStreamTypeFromHeader(head) };
}

/**
 * An Ogg page is a 27-byte header, a segment table whose length is given by
 * byte 26, then the payload. Opus announces itself with an `OpusHead` packet
 * at the start of that payload, so we check that exact position rather than
 * scanning - a Vorbis stream may well mention "OpusHead" in its metadata.
 */
function isOggOpus(head: Buffer): boolean {
  if (head.length <= OGG_SEGMENT_COUNT_OFFSET) return false;

  const segmentCount = head[OGG_SEGMENT_COUNT_OFFSET] as number;
  const payloadOffset = OGG_HEADER_BYTES + segmentCount;
  if (head.length < payloadOffset + 8) return false;

  return head.subarray(payloadOffset, payloadOffset + 8).toString('latin1') === 'OpusHead';
}

async function readHead(source: Readable, size: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;

  while (total < size) {
    const chunk = source.read() as Buffer | null;
    if (chunk !== null) {
      chunks.push(chunk);
      total += chunk.length;
      continue;
    }
    if (source.readableEnded || source.destroyed) break;
    await nextReadable(source);
  }

  return Buffer.concat(chunks, total);
}

/** Resolves when more data may be available, or the source is done. */
function nextReadable(source: Readable): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const settle = (fn: () => void) => () => {
      source.off('readable', onReadable);
      source.off('end', onDone);
      source.off('close', onDone);
      source.off('error', onError);
      fn();
    };
    const onReadable = settle(resolve);
    const onDone = settle(resolve);
    const onError = (err: Error) => settle(() => reject(err))();

    source.once('readable', onReadable);
    source.once('end', onDone);
    source.once('close', onDone);
    source.once('error', onError);
  });
}

function forwardTo(source: Readable, out: PassThrough): void {
  source.on('error', (err: Error) => out.destroy(err));

  if (source.errored) {
    out.destroy(source.errored);
    return;
  }
  if (source.readableEnded) {
    out.end();
    return;
  }
  if (source.destroyed) {
    // Destroyed mid-sniff: an error event, if any, arrives on the handler above.
    process.nextTick(() => {
      if (!source.errored && !out.writableEnded) out.end();
    });
    return;
  }

  source.pipe(out);
}
