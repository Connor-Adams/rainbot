import { useMutation, useQueryClient } from '@tanstack/react-query';
import { botApi } from '@/lib/api';
import { useQueueQuery } from '@/hooks/useLiveQuery';
import { useGuildStore } from '@/stores/guildStore';
import type { MediaItem } from '@/types';
import { Card, CardHeader, CardTitle, CardContent, Button, Badge } from '@/components/ui';
import { toast } from '@connor-adams/designsystem';
import EmptyState from '@/components/common/EmptyState';
import QueueItem from '@/components/queue/QueueItem';
import { Icon } from '@connor-adams/designsystem';

export default function QueueList() {
  const { selectedGuildId } = useGuildStore();
  const queryClient = useQueryClient();

  const { data: queueData } = useQueueQuery(selectedGuildId);

  const removeMutation = useMutation({
    mutationFn: (index: number) => botApi.removeFromQueue(selectedGuildId!, index),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['queue', selectedGuildId] });
    },
  });

  // The in-flight state is the mutation's own `isPending`, not a hand-rolled
  // flag. The flag version was set before `mutate()` and cleared only in
  // `onSuccess` — there was no `onError` — so a failed clear left the button
  // disabled with its label hidden behind the spinner, for good: a page reload
  // was the only way back. `isPending` cannot get stuck, because React Query
  // clears it on settle however the request ends.
  const clearMutation = useMutation({
    mutationFn: () => botApi.clearQueue(selectedGuildId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['queue', selectedGuildId] });
    },
    onError: (error: Error & { response?: { data?: { error?: string } } }) => {
      toast.error(error.response?.data?.error || error.message || 'Failed to clear the queue');
    },
  });

  const handleClear = () => {
    if (window.confirm('Clear the entire queue?')) {
      clearMutation.mutate();
    }
  };

  const queue = queueData?.queue ?? [];
  const totalInQueue = queue.length;
  const hasQueue = queue.length > 0 || !!queueData?.nowPlaying;

  if (!selectedGuildId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Queue</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState icon="🎵" message="Select a server to view queue" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col min-h-0">
      <CardHeader className="flex-shrink-0">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <CardTitle>Queue</CardTitle>
            {queueData?.isAutoplay && (
              <span className="text-xs text-primary font-normal" title="Autoplay enabled">
                🔁
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="default" size="md">
              {totalInQueue}
            </Badge>
            {hasQueue && (
              <Button
                variant="danger"
                size="sm"
                onClick={handleClear}
                isLoading={clearMutation.isPending}
                icon={<Icon name="trash" size={16} />}
              >
                Clear
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      {/* `contain-layout` is what actually stops a long queue from stretching
          the page, and it is not interchangeable with the overflow rules next
          to it. Even with this scroller correctly clipping its 1842px of rows
          to 394px, Chrome still propagated the *pre-clip* layout overflow up
          through the height-capped sidebar into the document's scrollable
          area: measured at 1280x900 the document stayed 2271px tall with
          nothing painted below 1071px — 1200px of empty scroll. Containing
          layout here scopes that overflow to this box, and the document drops
          to 1071px.
          Deliberately here rather than `overflow-hidden`/`overflow-y-auto` on
          the sidebar, which also silence the propagation but do it by making
          the sidebar itself scroll (or clip) 1395px of phantom space — that
          relocates the dead zone instead of removing it. */}
      <CardContent className="flex-1 overflow-y-auto min-h-0 contain-layout">
        {queue.length === 0 ? (
          <EmptyState
            icon="🎵"
            message="Queue is empty"
            submessage={
              queueData?.isAutoplay
                ? 'Add tracks to start playing. 🔁 Autoplay is enabled - similar tracks will play automatically'
                : 'Add tracks to start playing'
            }
          />
        ) : (
          <div className="flex flex-col gap-2 pr-2">
            {queue.map((track: MediaItem, index: number) => (
              <QueueItem
                key={index}
                track={track}
                index={index}
                onRemove={() => removeMutation.mutate(index)}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
