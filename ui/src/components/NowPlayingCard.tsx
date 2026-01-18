import { useMutation, useQueryClient } from '@tanstack/react-query'
import { playbackApi } from '@/lib/api'
import type { QueueData } from '@/types'
import { useState, useEffect } from 'react'
import { NowPlayingArtwork, TrackInfo, ProgressBar, PlaybackControls } from './player'

interface NowPlayingCardProps {
  queueData: QueueData
  guildId: string
}

export default function NowPlayingCard({ queueData, guildId }: NowPlayingCardProps) {
  const queryClient = useQueryClient()
  const [currentTime, setCurrentTime] = useState(0)

  const currentTrack = queueData.currentTrack || {
    title: queueData.nowPlaying || 'No track playing',
    duration: 0,
  }

  const pauseMutation = useMutation({
    mutationFn: () => playbackApi.pause(guildId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['queue', guildId] })
      queryClient.invalidateQueries({ queryKey: ['bot-status'] })
    },
  })

  const skipMutation = useMutation({
    mutationFn: () => playbackApi.skip(guildId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['queue', guildId] })
      queryClient.invalidateQueries({ queryKey: ['bot-status'] })
    },
  })

  const isPaused = queueData.isPaused || false

  // Simulate progress (would need real-time updates from API)
  useEffect(() => {
    if (!isPaused && currentTrack.duration) {
      const interval = setInterval(() => {
        setCurrentTime((prev) => {
          if (prev >= (currentTrack.duration || 0)) {
            return prev
          }
          return prev + 1
        })
      }, 1000)
      return () => clearInterval(interval)
    }
  }, [isPaused, currentTrack.duration])

  const getSourceInfo = () => {
    if (currentTrack.isLocal) {
      return { text: 'Local Sound', link: null }
    }
    if (currentTrack.spotifyUrl || currentTrack.spotifyId) {
      return { text: 'Spotify', link: currentTrack.spotifyUrl || currentTrack.url }
    }
    if (currentTrack.url?.includes('youtube') || currentTrack.url?.includes('youtu.be')) {
      return { text: 'YouTube', link: currentTrack.url }
    }
    if (currentTrack.url?.includes('soundcloud')) {
      return { text: 'SoundCloud', link: currentTrack.url }
    }
    if (currentTrack.url) {
      return { text: 'Stream', link: currentTrack.url }
    }
    return { text: 'Playing', link: null }
  }

  const sourceInfo = getSourceInfo()

  const handleProgressClick = () => {
    // TODO: Would seek to position here if API supported it
  }

  return (
    <section className="panel now-playing-card bg-surface rounded-2xl border border-border overflow-hidden">
      <div className="now-playing-content flex flex-col lg:flex-row gap-6 lg:gap-8 p-4 sm:p-6 lg:p-8 items-center lg:items-start">
        <NowPlayingArtwork isPlaying={!isPaused} />
        
        <div className="now-playing-info flex-1 flex flex-col gap-6 min-w-0 w-full">
          <TrackInfo
            title={currentTrack.title}
            source={sourceInfo.text}
            sourceLink={sourceInfo.link}
          />
          
          <ProgressBar
            currentTime={currentTime}
            duration={currentTrack.duration || 0}
            onClick={handleProgressClick}
          />
          
          <PlaybackControls
            isPaused={isPaused}
            isLoading={pauseMutation.isPending || skipMutation.isPending}
            onPlayPause={() => pauseMutation.mutate()}
            onSkip={() => skipMutation.mutate()}
          />
        </div>
      </div>
    </section>
  )
}
