import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { botApi } from '@/lib/api';
import { useGuildStore } from '@/stores/guildStore';
import type { MediaItem } from '@/types';
import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent, Button, Badge } from '@/components/ui';
import EmptyState from '@/components/common/EmptyState';
import QueueItem from '@/components/queue/QueueItem';
import { TrashIcon } from '@/components/icons';

export default function QueueList() {
  const { selectedGuildId } = useGuildStore();
  const queryClient = useQueryClient();
  const [isClearing, setIsClearing] = useState(false);

  const { data: queueData } = useQuery({
    queryKey: ['queue', selectedGuildId],
    queryFn: () => botApi.getQueue(selectedGuildId!).then((res) => res.data),
    enabled: !!selectedGuildId,
    refetchInterval: 5000,
  });

  const removeMutation = useMutation({
    mutationFn: (index: number) => botApi.removeFromQueue(selectedGuildId!, index),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['queue', selectedGuildId] });
    },
  });

  const clearMutation = useMutation({
    mutationFn: () => botApi.clearQueue(selectedGuildId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['queue', selectedGuildId] });
      setIsClearing(false);
    },
  });

  const handleClear = () => {
    if (window.confirm('Clear the entire queue?')) {
      setIsClearing(true);
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
                isLoading={isClearing}
                icon={<TrashIcon size={16} />}
              >
                Clear
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex-1 overflow-y-auto min-h-0">
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
