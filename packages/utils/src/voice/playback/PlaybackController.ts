// util-category: audio
import { AudioPlayerStatus, AudioResource } from '@discordjs/voice';
import { createLogger } from '../../logger';
import type { VoiceState } from '@rainbot/protocol';
import type { Track } from '@rainbot/protocol';
import { resetPlaybackTiming, markPaused, markResumed } from './PlaybackTiming';

const log = createLogger('PLAYBACK_CTRL');

export class PlaybackController {
  static play(state: VoiceState, track: Track, resource: AudioResource): void {
    if (resource.volume) {
      resource.volume.setVolume((state.volume || 100) / 100);
    }

    state.player.play(resource);
    state.currentResource = track.isSoundboard ? null : (resource as any);
    state.currentTrack = track;
    state.nowPlaying = track.title;
    state.currentTrackSource = track.isLocal ? null : track.url || null;

    resetPlaybackTiming(state);

    if (!track.isSoundboard && track.url) {
      state.lastPlayedTrack = track;
    }

    log.info(`Now playing: ${track.title}`);
  }

  static pause(state: VoiceState): void {
    state.player.pause();
    markPaused(state);
  }

  static resume(state: VoiceState): void {
    state.player.unpause();
    markResumed(state);
  }

  static stop(state: VoiceState): void {
    state.player.stop();
    state.queue = [];
    state.currentTrack = null;
    state.currentResource = null;
    state.nowPlaying = null;
    state.currentTrackSource = null;
    state.playbackStartTime = null;
    state.pauseStartTime = null;
    state.totalPausedTime = 0;
  }

  static setVolume(state: VoiceState, volume: number): void {
    state.volume = volume;
    if (state.currentResource?.volume) {
      state.currentResource.volume.setVolume(volume / 100);
    }
  }

  static canToggle(state: VoiceState): boolean {
    return (
      state.player.state.status === AudioPlayerStatus.Playing ||
      state.player.state.status === AudioPlayerStatus.Paused
    );
  }
}
