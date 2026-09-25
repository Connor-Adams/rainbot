import type { Track } from '@/types';
import { formatDuration } from '@/lib/utils';
import { Button, Badge } from '@/components/ui';
import { Icon } from '@connor-adams/designsystem';

interface QueueItemProps {
  track: Track;
  index: number;
  onRemove: (index: number) => void;
}

function getTrackSource(track: Track) {
  if (track.isLocal) return { icon: '📁', text: 'Local' };
  if (track.spotifyUrl || track.spotifyId) return { icon: '🎵', text: 'Spotify' };
  if (track.url?.includes('youtube')) return { icon: '▶️', text: 'YouTube' };
  if (track.url?.includes('soundcloud')) return { icon: '🎧', text: 'SoundCloud' };
  return { icon: '🎵', text: 'Stream' };
}

/**
 * `MediaItem` carries both `duration` (SECONDS) and `durationMs`
 * (MILLISECONDS), both optional, and `formatDuration` takes seconds — so the
 * two fields have to be normalised before they can be formatted. Reading one as
 * the other turns a 4-minute track into either 68 hours or a quarter second.
 *
 * `duration` wins when both are set, matching how the bots resolve the same
 * ambiguity (`apps/raincloud/commands/voice/queue.js`,
 * `apps/raincloud/handlers/musicButtonHandlers.ts`). The ms value is rounded
 * because `formatDuration` does `seconds % 60` and would otherwise print
 * `4:5.678000000000004`.
 */
function trackDurationSeconds(track: Track): number | undefined {
  if (track.duration != null) return track.duration;
  if (track.durationMs != null) return Math.round(track.durationMs / 1000);
  return undefined;
}

export default function QueueItem({ track, index, onRemove }: QueueItemProps) {
  const source = getTrackSource(track);
  const durationSeconds = trackDurationSeconds(track);

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
          title={track.title ?? 'Unknown'}
        >
          {track.title ?? 'Unknown'}
        </div>
        <div className="flex items-center gap-3 text-xs text-text-secondary font-medium">
          <span className="flex items-center gap-1.5">
            {source.icon} {source.text}
          </span>
          {durationSeconds ? <span>{formatDuration(durationSeconds)}</span> : null}
        </div>
      </div>

      <Button
        variant="ghost"
        size="sm"
        onClick={() => onRemove(index)}
        icon={<Icon name="x" size={16} />}
        className="!min-h-[32px] !w-8 !p-0 flex-shrink-0 hover:bg-danger hover:text-text-primary"
        aria-label={`Remove ${track.title ?? 'Unknown'} from queue`}
      >
        <span className="sr-only">Remove {track.title ?? 'Unknown'} from queue</span>
      </Button>
    </div>
  );
}
