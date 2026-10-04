import { EventEmitter } from 'events';
import { AudioPlayerStatus } from '@discordjs/voice';
import type { Track } from '@rainbot/protocol';

/**
 * Mirrors @discordjs/voice: stop() takes the player to Idle (emitting the
 * status event) and play() takes it to Playing.
 */
class FakePlayer extends EventEmitter {
  state: { status: AudioPlayerStatus } = { status: AudioPlayerStatus.Playing };
  stop(): boolean {
    this.state = { status: AudioPlayerStatus.Idle };
    this.emit(AudioPlayerStatus.Idle);
    return true;
  }
  play(): void {
    this.state = { status: AudioPlayerStatus.Playing };
  }
}

jest.mock('@discordjs/voice', () => ({
  ...jest.requireActual('@discordjs/voice'),
  createAudioPlayer: () => new FakePlayer(),
}));
const createTrackResourceForAny = jest.fn();
jest.mock('../../voice/audioResource', () => ({
  createTrackResourceForAny: (...args: unknown[]) => createTrackResourceForAny(...args),
}));
jest.mock('../../voice/trackFetcher', () => ({ fetchTracks: jest.fn() }));

import { createRpcHandlers } from '../rpc';
import { getOrCreateGuildState, guildStates } from '../../state/guild-state';

const current: Track = { title: 'Current', url: 'https://youtu.be/current', duration: 300 };
const next: Track = { title: 'Next', url: 'https://youtu.be/next', duration: 200 };

function setup(guildId: string) {
  const state = getOrCreateGuildState(guildId);
  state.connection = {} as never;
  state.currentTrack = current;
  state.nowPlaying = current.title ?? null;
  state.queue = [next];
  const handlers = createRpcHandlers({
    client: {} as never,
    requestCache: new Map() as never,
  });
  return { state, handlers };
}

describe('seek', () => {
  afterEach(() => {
    guildStates.clear();
    createTrackResourceForAny.mockReset();
  });

  it('stays on the current track instead of skipping to the next one', async () => {
    createTrackResourceForAny.mockResolvedValue({ volume: { setVolume: jest.fn() } });
    const { state, handlers } = setup('g1');

    const response = await handlers.seek({ requestId: 'r1', guildId: 'g1', positionSeconds: 60 });

    expect(response).toEqual({ status: 'success' });
    expect(createTrackResourceForAny).toHaveBeenCalledTimes(1);
    expect(createTrackResourceForAny).toHaveBeenCalledWith(current, 60);
    expect(state.currentTrack).toBe(current);
    expect(state.queue).toEqual([next]);
    expect(state.isSeeking).toBe(false);
  });

  it('moves on to the next track when the seek itself fails', async () => {
    createTrackResourceForAny
      .mockRejectedValueOnce(new Error('HTTP Error 403: Forbidden'))
      .mockResolvedValue({ volume: { setVolume: jest.fn() } });
    const { state, handlers } = setup('g2');

    const response = await handlers.seek({ requestId: 'r2', guildId: 'g2', positionSeconds: 60 });

    expect(response).toMatchObject({ status: 'error' });
    expect(state.isSeeking).toBe(false);
    expect(createTrackResourceForAny).toHaveBeenLastCalledWith(next);
  });
});
