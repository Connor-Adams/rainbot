import { formatDuration } from '@/lib/utils'

interface ProgressBarProps {
  currentTime: number
  duration: number
  onSeek?: () => void
}

/**
 * Progress bar with time indicators for track playback.
 */
export default function ProgressBar({ currentTime, duration, onSeek }: ProgressBarProps) {
  const progressPercentage = duration > 0 ? (currentTime / duration) * 100 : 0

  return (
    <div className="flex flex-col gap-3">
      <div
        className="relative w-full h-2 bg-surface rounded-full cursor-pointer overflow-hidden group"
        onClick={onSeek}
      >
        <div
          className="absolute top-0 left-0 h-full bg-gradient-to-r from-primary to-secondary rounded-full transition-all duration-100 shadow-glow"
          style={{ width: `${progressPercentage}%` }}
        />
        <div
          className="absolute top-1/2 left-0 w-4 h-4 bg-text-primary rounded-full transform -translate-x-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 shadow-md cursor-grab active:cursor-grabbing"
          style={{ left: `${progressPercentage}%` }}
        />
      </div>
      <div className="flex justify-between text-sm text-text-secondary font-mono">
        <span>{formatDuration(currentTime)}</span>
        <span>{formatDuration(duration)}</span>
      </div>
    </div>
  )
}
