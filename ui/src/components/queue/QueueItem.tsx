import type { Track } from '@/types'
import { escapeHtml, formatDuration } from '@/lib/utils'
import { Button, Badge } from '@/components/ui'
import { XIcon } from '@/components/icons'

interface QueueItemProps {
  track: Track
  index: number
  onRemove: (index: number) => void
}

function getTrackSource(track: Track) {
  if (track.isLocal) return { icon: '📁', text: 'Local' }
  if (track.spotifyUrl || track.spotifyId) return { icon: '🎵', text: 'Spotify' }
  if (track.url?.includes('youtube')) return { icon: '▶️', text: 'YouTube' }
  if (track.url?.includes('soundcloud')) return { icon: '🎧', text: 'SoundCloud' }
  return { icon: '🎵', text: 'Stream' }
}

export default function QueueItem({ track, index, onRemove }: QueueItemProps) {
  const source = getTrackSource(track)

  return (
    <div
      className="
        flex items-center gap-3 px-4 py-3
        bg-surface-elevated rounded-xl border border-transparent
        transition-all duration-200
        hover:border-primary hover:bg-surface-hover hover:translate-x-1
        animate-slide-in-left
      "
      style={{ animationDelay: `${index * 0.05}s` }}
    >
      <Badge variant="default" size="sm" className="w-8 h-8 flex-shrink-0 p-0">
        {index + 1}
      </Badge>

      <div className="flex-1 min-w-0 space-y-1">
        <div
          className="text-sm font-semibold text-text-primary whitespace-nowrap overflow-hidden text-ellipsis"
          title={escapeHtml(track.title)}
        >
          {escapeHtml(track.title)}
        </div>
        <div className="flex items-center gap-3 text-xs text-text-secondary font-medium">
          <span className="flex items-center gap-1.5">
            {source.icon} {source.text}
          </span>
          {track.duration && <span>{formatDuration(track.duration)}</span>}
        </div>
      </div>

      <Button
        variant="ghost"
        size="sm"
        onClick={() => onRemove(index)}
        icon={<XIcon size={16} />}
        className="!min-h-[32px] !w-8 !p-0 flex-shrink-0 hover:bg-danger hover:text-white"
        aria-label="Remove from queue"
      >
        <span className="sr-only">Remove</span>
      </Button>
    </div>
  )
}
