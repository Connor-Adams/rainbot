import { EventEmitter } from 'events';
import { AudioPlayerStatus } from '@discordjs/voice';
import type { Track } from '@rainbot/protocol';

class FakePlayer extends EventEmitter {
  state: { status: AudioPlayerStatus } = { status: AudioPlayerStatus.Idle };
}

jest.mock('@discordjs/voice', () => ({
  ...jest.requireActual('@discordjs/voice'),
  createAudioPlayer: () => new FakePlayer(),
}));
jest.mock('../../voice/audioResource', () => ({
  createTrackResourceForAny: jest.fn(),
}));

import { getOrCreateGuildState, guildStates } from '../guild-state';

const track: Track = { title: 'Palm Tree Escape', url: 'https://youtu.be/x', duration: 120 };

function playingState(guildId: string) {
  const state = getOrCreateGuildState(guildId);
  state.currentTrack = track;
  state.nowPlaying = track.title ?? null;
  return state;
}

describe('player Idle handler', () => {
  afterEach(() => guildStates.clear());

  it('clears now playing when the track really ends', () => {
    const state = playingState('g1');

    state.player.emit(AudioPlayerStatus.Idle);

    expect(state.currentTrack).toBeNull();
    expect(state.nowPlaying).toBeNull();
  });

  it('ignores the Idle that seek causes by stopping the old stream', () => {
    const state = playingState('g2');
    state.isSeeking = true;

    state.player.emit(AudioPlayerStatus.Idle);

    expect(state.currentTrack).toBe(track);
    expect(state.nowPlaying).toBe(track.title);
  });

  it('ignores an Idle delivered after the player already moved on', () => {
    const state = playingState('g3');
    (state.player as unknown as FakePlayer).state = { status: AudioPlayerStatus.Playing };

    state.player.emit(AudioPlayerStatus.Idle);

    expect(state.currentTrack).toBe(track);
  });
});
