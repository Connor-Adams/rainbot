import { PlayIcon, PauseIcon, SkipBackIcon, SkipForwardIcon } from '../icons'

interface PlaybackControlsProps {
  isPaused: boolean
  onPause: () => void
  onSkip: () => void
  isPauseDisabled?: boolean
  isSkipDisabled?: boolean
}

/**
 * Playback control buttons (previous, play/pause, next).
 */
export default function PlaybackControls({
  isPaused,
  onPause,
  onSkip,
  isPauseDisabled = false,
  isSkipDisabled = false,
}: PlaybackControlsProps) {
  return (
    <div className="flex items-center justify-center gap-6">
      <button
        className="w-12 h-12 rounded-full bg-surface-elevated border border-border flex items-center justify-center text-text-secondary hover:text-text-primary hover:border-border-hover transition-all duration-200"
        title="Previous"
        disabled
      >
        <SkipBackIcon size={24} />
      </button>
      
      <button
        className="w-16 h-16 rounded-full bg-gradient-to-r from-primary to-primary-dark text-text-primary shadow-glow hover:shadow-glow-strong hover:scale-105 active:scale-95 transition-all duration-200 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
        onClick={onPause}
        disabled={isPauseDisabled}
        title={isPaused ? 'Resume' : 'Pause'}
      >
        {isPaused ? <PlayIcon size={28} /> : <PauseIcon size={28} />}
      </button>
      
      <button
        className="w-12 h-12 rounded-full bg-surface-elevated border border-border flex items-center justify-center text-text-secondary hover:text-text-primary hover:border-border-hover transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
        onClick={onSkip}
        disabled={isSkipDisabled}
        title="Next"
      >
        <SkipForwardIcon size={24} />
      </button>
    </div>
  )
}
