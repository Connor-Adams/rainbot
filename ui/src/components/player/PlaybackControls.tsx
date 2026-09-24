import { PlayIcon, PauseIcon, SkipPreviousIcon, SkipNextIcon } from '@/components/icons';
import { Button } from '@/components/ui';

interface PlaybackControlsProps {
  isPaused: boolean;
  isLoading?: boolean;
  onPlayPause: () => void;
  onSkip: () => void;
  onPrevious?: () => void;
}

/**
 * Playback control buttons (previous, play/pause, next).
 * Displays large, accessible buttons for controlling audio playback.
 * Primary play/pause button is highlighted, skip buttons are secondary.
 *
 * @param isPaused - Whether playback is currently paused
 * @param isLoading - Whether an action is in progress (disables buttons)
 * @param onPlayPause - Handler for play/pause toggle
 * @param onSkip - Handler for skip to next track
 * @param onPrevious - Optional handler for previous track (button disabled if not provided)
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
      <Button
        variant="secondary"
        size="icon"
        title="Previous"
        disabled={!onPrevious}
        onClick={onPrevious}
      >
        <SkipPreviousIcon size={24} />
      </Button>

      <Button
        variant="primary"
        size="icon"
        onClick={onPlayPause}
        disabled={isLoading}
        title={isPaused ? 'Resume' : 'Pause'}
      >
        {isPaused ? <PlayIcon size={24} /> : <PauseIcon size={24} />}
      </Button>

      <Button variant="secondary" size="icon" onClick={onSkip} disabled={isLoading} title="Next">
        <SkipNextIcon size={24} />
      </Button>
    </div>
  );
}
