// util-category: audio
import { createLogger } from '../../logger';
import { resolveStream } from './StreamResolver';
import { createMusicResource } from './ResourceFactory';
import type { Track } from '@rainbot/protocol';
import type { VoiceState } from '@rainbot/protocol';
import type { AudioResource } from '@discordjs/voice';
import { Readable } from 'stream';

const log = createLogger('PREBUFFER');

export interface PrebufferedTrack {
  track: Track;
  resource: AudioResource;
  stream: Readable;
}

/**
 * Prebuffer the next playable music track (non-soundboard)
 */
export async function prebufferNext(state: VoiceState): Promise<void> {
  clearPrebuffer(state);

  // Only prebuffer the next non-soundboard track
  const nextTrack = state.queue.find((track) => !track.isSoundboard);
  if (!nextTrack) return;

  try {
    log.debug(`Prebuffering: ${nextTrack.title}`);

    const stream = await resolveStream(nextTrack);
    const resource = createMusicResource(stream);

    state.preBuffered = {
      track: nextTrack,
      resource,
      stream,
    };

    log.debug(`Prebuffered ready: ${nextTrack.title}`);
  } catch (err) {
    log.debug(`Prebuffer failed: ${(err as Error).message}`);
    clearPrebuffer(state);
  }
}

/**
 * Destroy any prebuffered stream safely
 */
export function clearPrebuffer(state: VoiceState): void {
  const prebuffer = state.preBuffered as PrebufferedTrack | null;
  if (!prebuffer) return;

  try {
    prebuffer.stream.destroy();
  } catch (err) {
    log.debug(`Error destroying prebuffer stream: ${(err as Error).message}`);
  }

  state.preBuffered = null;
}
