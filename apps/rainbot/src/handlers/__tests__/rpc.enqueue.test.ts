import { EventEmitter } from 'events';
import { AudioPlayerStatus } from '@discordjs/voice';
import type { Track } from '@rainbot/protocol';

/** Stays Playing, so enqueue never kicks off playNext and the queue is left as built. */
class FakePlayer extends EventEmitter {
  state: { status: AudioPlayerStatus } = { status: AudioPlayerStatus.Playing };
  stop(): boolean {
    return true;
  }
  play(): void {}
}

jest.mock('@discordjs/voice', () => ({
  ...jest.requireActual('@discordjs/voice'),
  createAudioPlayer: () => new FakePlayer(),
}));
jest.mock('../../voice/audioResource', () => ({ createTrackResourceForAny: jest.fn() }));
const fetchTracks = jest.fn();
jest.mock('../../voice/trackFetcher', () => ({
  fetchTracks: (...args: unknown[]) => fetchTracks(...args),
}));

import { createRpcHandlers } from '../rpc';
import { getOrCreateGuildState, guildStates } from '../../state/guild-state';

const queued: Track = { title: 'Queued', url: 'https://youtu.be/queued' };
const ADDED_URL = 'https://youtu.be/added';
const added: Track = { title: 'Added', url: ADDED_URL };

function setup(guildId: string) {
  const state = getOrCreateGuildState(guildId);
  state.connection = {} as never;
  state.currentTrack = { title: 'Current', url: 'https://youtu.be/current' };
  state.queue = [{ ...queued }];
  const handlers = createRpcHandlers({
    client: {} as never,
    requestCache: new Map() as never,
  });
  return { state, handlers };
}

describe('enqueue', () => {
  beforeEach(() => fetchTracks.mockResolvedValue([added]));
  afterEach(() => {
    guildStates.clear();
    fetchTracks.mockReset();
  });

  it('appends to the end of the queue by default', async () => {
    const { state, handlers } = setup('g1');

    const response = await handlers.enqueue({
      requestId: 'r1',
      guildId: 'g1',
      url: ADDED_URL,
      requestedBy: 'u1',
    });

    expect(response).toMatchObject({ status: 'success', position: 2 });
    expect(state.queue.map((t) => t.title)).toEqual(['Queued', 'Added']);
  });

  it('puts the track at the front of the queue with next', async () => {
    const { state, handlers } = setup('g2');

    const response = await handlers.enqueue({
      requestId: 'r2',
      guildId: 'g2',
      url: ADDED_URL,
      requestedBy: 'u1',
      next: true,
    });

    expect(response).toMatchObject({ status: 'success', position: 1 });
    expect(state.queue.map((t) => t.title)).toEqual(['Added', 'Queued']);
  });
});
