import { PlayIcon, PauseIcon, SkipPreviousIcon, SkipNextIcon } from '@/components/icons'

interface PlaybackControlsProps {
  isPaused: boolean
  isLoading?: boolean
  onPlayPause: () => void
  onSkip: () => void
  onPrevious?: () => void
}

/**
 * Playback control buttons (previous, play/pause, next).
 * Displays large, accessible buttons for controlling audio playback.
 */
export default function PlaybackControls({
  isPaused,
  isLoading = false,
  onPlayPause,
  onSkip,
  onPrevious,
}: PlaybackControlsProps) {
  return (
    <div className="player-controls-main flex items-center justify-center gap-6">
      <button
        className="control-btn control-btn-large"
        title="Previous"
        disabled={!onPrevious}
        onClick={onPrevious}
      >
        <SkipPreviousIcon size={24} />
      </button>

      <button
        className="control-btn control-btn-primary control-btn-large"
        onClick={onPlayPause}
        disabled={isLoading}
        title={isPaused ? 'Resume' : 'Pause'}
      >
        {isPaused ? <PlayIcon size={24} /> : <PauseIcon size={24} />}
      </button>

      <button
        className="control-btn control-btn-large"
        onClick={onSkip}
        disabled={isLoading}
        title="Next"
      >
        <SkipNextIcon size={24} />
      </button>
    </div>
  )
}
