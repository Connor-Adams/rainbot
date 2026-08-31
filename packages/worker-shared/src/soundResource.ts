import { createAudioResource, StreamType } from '@discordjs/voice';
import type { AudioResource } from '@discordjs/voice';
import prism from 'prism-media';
import type { Readable } from 'stream';

/**
 * Builds an audio resource for a soundboard clip.
 *
 * Opus sources are demuxed in-process rather than handed to @discordjs/voice as
 * ogg/opus. With `inlineVolume` the transformer graph prices the ffmpeg path
 * (ffmpeg pcm + volume + encoder = 4.0) below the native one (demuxer + decoder
 * + volume + encoder = 4.5), so every clip would otherwise fork an ffmpeg
 * process. Rapid soundboard use then exhausts the container's fork budget and
 * the resulting `spawn ffmpeg EAGAIN` arrives as an unhandled ChildProcess
 * error, which kills the worker.
 */
export function createSoundAudioResource(
  stream: Readable,
  inputType: StreamType,
  volume: number
): AudioResource {
  const demuxer = createOpusDemuxer(inputType);
  let input: Readable = stream;
  let resolvedType = inputType;

  if (demuxer) {
    stream.on('error', (error: Error) => demuxer.destroy(error));
    input = stream.pipe(demuxer);
    resolvedType = StreamType.Opus;
  }

  const resource = createAudioResource(input, { inputType: resolvedType, inlineVolume: true });
  resource.volume?.setVolume(volume);
  return resource;
}

function createOpusDemuxer(
  inputType: StreamType
): prism.opus.OggDemuxer | prism.opus.WebmDemuxer | null {
  if (inputType === StreamType.OggOpus) return new prism.opus.OggDemuxer();
  if (inputType === StreamType.WebmOpus) return new prism.opus.WebmDemuxer();
  return null;
}
