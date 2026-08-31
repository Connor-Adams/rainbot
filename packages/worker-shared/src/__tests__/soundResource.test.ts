import { Readable } from 'stream';
import { StreamType } from '@discordjs/voice';
import { createSoundAudioResource } from '../soundResource';

function emptyStream(): Readable {
  return Readable.from([]);
}

describe('createSoundAudioResource', () => {
  it('never routes ogg/opus sounds through ffmpeg, even with inline volume', () => {
    const resource = createSoundAudioResource(emptyStream(), StreamType.OggOpus, 0.7);

    const ffmpegEdges = resource.edges.filter((edge) => edge.type.includes('ffmpeg'));
    expect(ffmpegEdges).toEqual([]);
  });

  it('never routes webm/opus sounds through ffmpeg, even with inline volume', () => {
    const resource = createSoundAudioResource(emptyStream(), StreamType.WebmOpus, 0.7);

    const ffmpegEdges = resource.edges.filter((edge) => edge.type.includes('ffmpeg'));
    expect(ffmpegEdges).toEqual([]);
  });

  it('applies the requested volume', () => {
    const resource = createSoundAudioResource(emptyStream(), StreamType.OggOpus, 0.4);

    expect(resource.volume?.volume).toBeCloseTo(0.4);
  });
});
