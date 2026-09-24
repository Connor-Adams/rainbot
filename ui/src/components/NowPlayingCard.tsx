import { useMutation, useQueryClient } from '@tanstack/react-query';
import { playbackApi } from '@/lib/api';
import { YouTubeUrl } from '@rainbot/shared/youtube';
import type { QueueData } from '@/types';
import { useState, useEffect } from 'react';
import { MediaPlayer, type MediaTrack } from '@connor-adams/designsystem';

interface NowPlayingCardProps {
  queueData: QueueData;
  guildId: string;
}

/** Duration in seconds from API (durationMs) or track (duration or durationMs). */
function durationSeconds(queueData: QueueData, currentTrack: QueueData['nowPlaying']): number {
  if (queueData.durationMs != null && queueData.durationMs >= 0) {
    return queueData.durationMs / 1000;
  }
  if (currentTrack?.duration != null && currentTrack.duration >= 0) {
    return currentTrack.duration;
  }
  if (currentTrack?.durationMs != null && currentTrack.durationMs >= 0) {
    return currentTrack.durationMs / 1000;
  }
  return 0;
}

export default function NowPlayingCard({ queueData, guildId }: NowPlayingCardProps) {
  const queryClient = useQueryClient();
  const durationSec = durationSeconds(queueData, queueData.nowPlaying ?? undefined);
  const initialPosition =
    queueData.positionMs != null && queueData.positionMs >= 0 ? queueData.positionMs / 1000 : 0;
  const [currentTime, setCurrentTime] = useState(initialPosition);

  const currentTrack = queueData.nowPlaying ?? {
    title: 'No track playing',
    duration: 0,
  };
  const trackKey = `${currentTrack.title}-${currentTrack.url ?? ''}-${durationSec}`;

  // Reset position when track changes (defer setState to avoid set-state-in-effect)
  useEffect(() => {
    queueMicrotask(() => setCurrentTime(initialPosition));
  }, [trackKey, initialPosition]);

  const pauseMutation = useMutation({
    mutationFn: () => playbackApi.pause(guildId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['queue', guildId] });
      queryClient.invalidateQueries({ queryKey: ['bot-status'] });
    },
  });

  const skipMutation = useMutation({
    mutationFn: () => playbackApi.skip(guildId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['queue', guildId] });
      queryClient.invalidateQueries({ queryKey: ['bot-status'] });
    },
  });

  const replayMutation = useMutation({
    mutationFn: () => playbackApi.replay(guildId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['queue', guildId] });
      queryClient.invalidateQueries({ queryKey: ['bot-status'] });
    },
  });

  const seekMutation = useMutation({
    mutationFn: (positionSeconds: number) => playbackApi.seek(guildId, positionSeconds),
    onSuccess: (_, positionSeconds) => {
      setCurrentTime(positionSeconds);
      queryClient.invalidateQueries({ queryKey: ['queue', guildId] });
      queryClient.invalidateQueries({ queryKey: ['bot-status'] });
    },
  });

  const isPaused = queueData.isPaused || false;

  // Sync position when API sends new positionMs (e.g. after refetch or SSE); defer setState to avoid set-state-in-effect
  useEffect(() => {
    if (queueData.positionMs != null && queueData.positionMs >= 0) {
      queueMicrotask(() => setCurrentTime(queueData.positionMs! / 1000));
    }
  }, [queueData.positionMs, trackKey]);

  const getSourceInfo = () => {
    if (currentTrack.isLocal) {
      return { text: 'Local Sound', link: null };
    }
    if (currentTrack.spotifyUrl || currentTrack.spotifyId) {
      return { text: 'Spotify', link: currentTrack.spotifyUrl || currentTrack.url };
    }
    if (currentTrack.url?.includes('youtube') || currentTrack.url?.includes('youtu.be')) {
      return { text: 'YouTube', link: currentTrack.url };
    }
    if (currentTrack.url?.includes('soundcloud')) {
      return { text: 'SoundCloud', link: currentTrack.url };
    }
    if (currentTrack.url) {
      return { text: 'Stream', link: currentTrack.url };
    }
    return { text: 'Playing', link: null };
  };

  const sourceInfo = getSourceInfo();

  const thumbnailUrl =
    currentTrack?.thumbnail ??
    (currentTrack?.url ? YouTubeUrl.getThumbnailUrl(currentTrack.url) : null);

  const handleSeek = (positionSeconds: number) => {
    if (durationSec <= 0) return;
    const clamped = Math.max(0, Math.min(Math.floor(positionSeconds), durationSec));
    seekMutation.mutate(clamped);
  };

  const track: MediaTrack = {
    title: currentTrack.title ?? 'Unknown',
    source: sourceInfo.text,
    sourceLink: sourceInfo.link,
    thumbnailUrl,
    duration: durationSec,
  };

  return (
    <>
      <MediaPlayer
        track={track}
        currentTime={currentTime}
        duration={durationSec}
        isPaused={isPaused}
        isLoading={
          pauseMutation.isPending ||
          skipMutation.isPending ||
          seekMutation.isPending ||
          replayMutation.isPending
        }
        onPlayPause={() => pauseMutation.mutate()}
        onSkip={() => skipMutation.mutate()}
        onPrevious={() => replayMutation.mutate()}
        onSeek={handleSeek}
        autoTick
      />
      {replayMutation.isError && (
        <p className="text-xs text-danger mt-2">
          {(
            replayMutation.error as {
              response?: { data?: { error?: string } };
              message?: string;
            }
          )?.response?.data?.error ??
            (replayMutation.error as Error)?.message ??
            'Failed to replay'}
        </p>
      )}
    </>
  );
}
