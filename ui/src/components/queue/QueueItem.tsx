import type { Track } from '@/types';
import { formatDuration } from '@/lib/utils';
import { Button, Badge } from '@/components/ui';
import { Icon } from '@connor-adams/designsystem';

/**
 * Entry-animation stagger, in milliseconds per row, and its ceiling.
 *
 * The delay used to be an uncapped `index * 0.05s`. The queue polls, so every
 * refresh re-mounts the rows and replays the animation — at 25 tracks the last
 * row finished appearing 1.25s after the first and the list visibly rippled on
 * each poll. Clamping the total keeps the effect for the first rows (the point
 * of a stagger) and makes a long queue cost the same as a short one.
 *
 * Whole milliseconds rather than fractional seconds: `index * 0.05` produced
 * `animationDelay: 0.15000000000000002s` from binary floating point.
 */
const STAGGER_STEP_MS = 50;
const STAGGER_MAX_MS = 300;

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
      style={{ animationDelay: `${Math.min(index * STAGGER_STEP_MS, STAGGER_MAX_MS)}ms` }}
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
