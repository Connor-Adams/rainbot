import { createAudioResource, StreamType, AudioResource } from '@discordjs/voice';
import { Readable } from 'stream';
import { createLogger } from '../logger';

const log = createLogger('RESOURCE_FACTORY');

function wireErrors(resource: AudioResource): void {
  if (resource.playStream) {
    resource.playStream.on('error', (err) => {
      log.debug(`AudioResource stream error: ${err.message}`);
    });
  }
}

export function createMusicResource(stream: Readable): AudioResource {
  const resource = createAudioResource(stream, {
    inputType: StreamType.Arbitrary,
    inlineVolume: true,
  });

  wireErrors(resource);
  return resource;
}

export function createSoundboardResource(stream: Readable): AudioResource {
  const resource = createAudioResource(stream, {
    inputType: StreamType.Arbitrary,
  });

  wireErrors(resource);
  return resource;
}
