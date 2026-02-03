import { useMutation, useQueryClient } from '@tanstack/react-query';
import { playbackApi } from '@/lib/api';
import { YouTubeUrl } from '@rainbot/shared';
import type { QueueData } from '@/types';
import { useState, useEffect, useRef } from 'react';
import { NowPlayingArtwork, TrackInfo, ProgressBar, PlaybackControls } from './player';

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
  const trackKeyRef = useRef(trackKey);

  // Reset position when track changes
  useEffect(() => {
    trackKeyRef.current = trackKey;
    setCurrentTime(initialPosition);
  }, [trackKey]);

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

  const seekMutation = useMutation({
    mutationFn: (positionSeconds: number) => playbackApi.seek(guildId, positionSeconds),
    onSuccess: (_, positionSeconds) => {
      setCurrentTime(positionSeconds);
      queryClient.invalidateQueries({ queryKey: ['queue', guildId] });
      queryClient.invalidateQueries({ queryKey: ['bot-status'] });
    },
  });

  const isPaused = queueData.isPaused || false;

  // Sync position when API sends new positionMs (e.g. after refetch or SSE)
  useEffect(() => {
    if (queueData.positionMs != null && queueData.positionMs >= 0) {
      setCurrentTime(queueData.positionMs / 1000);
    }
  }, [queueData.positionMs, trackKey]);

  // Tick progress locally when playing (smooth UX; API/SSE resyncs on state change)
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime((prev) => {
        if (trackKeyRef.current !== trackKey) {
          trackKeyRef.current = trackKey;
          return initialPosition;
        }
        if (isPaused || durationSec <= 0) return prev;
        if (prev >= durationSec) return prev;
        return prev + 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isPaused, durationSec, trackKey, initialPosition]);

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

  const handleProgressClick = (positionSeconds: number) => {
    if (durationSec <= 0) return;
    const clamped = Math.max(0, Math.min(Math.floor(positionSeconds), durationSec));
    seekMutation.mutate(clamped);
  };

  return (
    <section className="panel now-playing-card bg-surface rounded-2xl border border-border overflow-hidden">
      <div className="now-playing-content flex flex-col lg:flex-row gap-6 lg:gap-8 p-4 sm:p-6 lg:p-8 items-center lg:items-start">
        <NowPlayingArtwork isPlaying={!isPaused} thumbnailUrl={thumbnailUrl} />

        <div className="now-playing-info flex-1 flex flex-col gap-6 min-w-0 w-full">
          <TrackInfo
            title={currentTrack.title ?? 'Unknown'}
            source={sourceInfo.text}
            sourceLink={sourceInfo.link}
          />

          <ProgressBar
            currentTime={currentTime}
            duration={durationSec}
            onClick={handleProgressClick}
          />

          <PlaybackControls
            isPaused={isPaused}
            isLoading={pauseMutation.isPending || skipMutation.isPending || seekMutation.isPending}
            onPlayPause={() => pauseMutation.mutate()}
            onSkip={() => skipMutation.mutate()}
          />
        </div>
      </div>
    </section>
  );
}
