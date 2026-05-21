// util-category: audio
import type { VoiceState } from '@rainbot/protocol';

export function getPlaybackPosition(state: VoiceState): number {
  if (!state.playbackStartTime || !state.currentTrack) return 0;

  const elapsed = Date.now() - state.playbackStartTime;
  const paused = state.totalPausedTime || 0;
  const currentPause = state.pauseStartTime ? Date.now() - state.pauseStartTime : 0;

  return Math.max(0, Math.floor((elapsed - paused - currentPause) / 1000));
}

export function resetPlaybackTiming(state: VoiceState): void {
  state.playbackStartTime = Date.now();
  state.pauseStartTime = null;
  state.totalPausedTime = 0;
}

export function markPaused(state: VoiceState): void {
  state.pauseStartTime = Date.now();
}

export function markResumed(state: VoiceState): void {
  if (state.pauseStartTime) {
    state.totalPausedTime += Date.now() - state.pauseStartTime;
    state.pauseStartTime = null;
  }
}
