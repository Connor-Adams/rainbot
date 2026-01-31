import { formatDuration } from '@/lib/utils';

interface ProgressBarProps {
  currentTime: number;
  duration: number;
  onClick?: (positionSeconds: number) => void;
}

/**
 * Progress bar showing current playback position.
 * Displays a visual progress indicator with elapsed/total time labels.
 * Click on the bar to seek; onClick receives the target position in seconds.
 *
 * @param currentTime - Current playback position in seconds
 * @param duration - Total track duration in seconds
 * @param onClick - Optional click handler; receives positionSeconds derived from click
 */
export default function ProgressBar({ currentTime, duration, onClick }: ProgressBarProps) {
  const progressPercentage = duration && duration > 0 ? (currentTime / duration) * 100 : 0;

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!onClick || !duration || duration <= 0) return;
    const target = e.currentTarget;
    const rect = target.getBoundingClientRect();
    const fraction = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const positionSeconds = Math.floor(fraction * duration);
    onClick(positionSeconds);
  };

  return (
    <div className="progress-container flex flex-col gap-3">
      <div
        className="progress-bar relative w-full h-2 bg-surface-input rounded-full cursor-pointer overflow-hidden group"
        onClick={handleClick}
      >
        <div
          className="progress-fill absolute top-0 left-0 h-full bg-gradient-to-r from-primary to-secondary rounded-full transition-all duration-100 shadow-glow"
          style={{ width: `${progressPercentage}%` }}
        />
        <div
          className="progress-handle absolute top-1/2 left-0 w-4 h-4 bg-text-primary rounded-full transform -translate-x-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 shadow-md cursor-grab active:cursor-grabbing"
          style={{ left: `${progressPercentage}%` }}
        />
      </div>
      <div className="progress-time flex justify-between text-sm text-text-muted font-mono">
        <span>{formatDuration(currentTime)}</span>
        <span>{formatDuration(duration)}</span>
      </div>
    </div>
  );
}
