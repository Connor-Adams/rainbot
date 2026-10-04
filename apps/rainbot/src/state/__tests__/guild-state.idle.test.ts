import { EventEmitter } from 'events';
import { AudioPlayerStatus } from '@discordjs/voice';
import type { Track } from '@rainbot/protocol';

class FakePlayer extends EventEmitter {
  state: { status: AudioPlayerStatus } = { status: AudioPlayerStatus.Idle };
}

const createAudioPlayer = jest.fn((_options?: unknown) => new FakePlayer());
jest.mock('@discordjs/voice', () => ({
  ...jest.requireActual('@discordjs/voice'),
  createAudioPlayer: (options?: unknown) => createAudioPlayer(options),
}));
const log = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
jest.mock('../../config', () => ({ log }));
jest.mock('../../voice/audioResource', () => ({
  createTrackResourceForAny: jest.fn(),
}));

import {
  armPlaybackClock,
  buildPlaybackState,
  buildQueueState,
  getOrCreateGuildState,
  getPlaybackPosition,
  guildStates,
} from '../guild-state';

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

  it('logs a track that ends well before its duration', () => {
    const state = playingState('g4');
    state.playbackStartTime = Date.now() - 30_000;

    state.player.emit(AudioPlayerStatus.Idle);

    expect(log.warn).toHaveBeenCalledWith(
      expect.stringMatching(/ended early.*Palm Tree Escape.*30s of 120s/)
    );
  });

  it('does not warn when a track plays to the end', () => {
    log.warn.mockClear();
    const state = playingState('g5');
    state.playbackStartTime = Date.now() - 119_000;

    state.player.emit(AudioPlayerStatus.Idle);

    expect(log.warn).not.toHaveBeenCalled();
  });
});

describe('skip', () => {
  afterEach(() => guildStates.clear());

  it('is not reported as a track ending early', () => {
    log.warn.mockClear();
    const state = playingState('g7');
    state.playbackStartTime = Date.now() - 30_000;
    state.skipRequested = true;

    state.player.emit(AudioPlayerStatus.Idle);

    expect(log.warn).not.toHaveBeenCalled();
    expect(state.skipRequested).toBe(false);
  });
});

describe('audio player', () => {
  afterEach(() => guildStates.clear());

  it('rides out a stalled stream instead of ending the track after 100ms', () => {
    getOrCreateGuildState('g6');

    expect(createAudioPlayer).toHaveBeenLastCalledWith(
      expect.objectContaining({
        behaviors: expect.objectContaining({ maxMissedFrames: 250 }),
      })
    );
  });
});

describe('playback clock', () => {
  afterEach(() => guildStates.clear());

  function startAudio(state: ReturnType<typeof getOrCreateGuildState>) {
    const player = state.player as unknown as FakePlayer;
    const oldState = player.state;
    player.state = { status: AudioPlayerStatus.Playing };
    player.emit('stateChange', oldState, player.state);
  }

  it('reports the track as buffering, at 0, until audio flows', () => {
    const state = playingState('c1');
    armPlaybackClock(state, 0);
    state.player.state = { status: AudioPlayerStatus.Buffering } as never;

    const queue = buildQueueState(state, buildPlaybackState(state));

    expect(queue.isBuffering).toBe(true);
    expect(getPlaybackPosition(state)).toBe(0);
  });

  it('starts counting when the player actually reaches Playing', () => {
    const state = playingState('c2');
    armPlaybackClock(state, 0);

    startAudio(state);

    expect(state.playbackStartTime).toBeGreaterThan(Date.now() - 50);
    expect(buildQueueState(state, buildPlaybackState(state)).isBuffering).toBe(false);
  });

  it('keeps a seek offset across the buffering gap', () => {
    const state = playingState('c3');
    armPlaybackClock(state, 60);

    startAudio(state);

    expect(getPlaybackPosition(state)).toBe(60);
  });

  it('does not restart the clock on unpause', () => {
    const state = playingState('c4');
    armPlaybackClock(state, 0);
    startAudio(state);
    state.playbackStartTime = Date.now() - 30_000;

    startAudio(state);

    expect(getPlaybackPosition(state)).toBe(30);
  });
});
