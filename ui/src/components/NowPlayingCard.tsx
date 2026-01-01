import { useMutation, useQueryClient } from '@tanstack/react-query'
import { playbackApi } from '@/lib/api'
import type { QueueData } from '@/types'
import { useState, useEffect } from 'react'
import AlbumArtwork from './player/AlbumArtwork'
import TrackInfo from './player/TrackInfo'
import ProgressBar from './player/ProgressBar'
import PlaybackControls from './player/PlaybackControls'

interface NowPlayingCardProps {
  queueData: QueueData
  guildId: string
}

/**
 * Determines the source type and external link from track data.
 */
function getSourceInfo(currentTrack: {
  isLocal?: boolean
  spotifyUrl?: string
  spotifyId?: string
  url?: string
}) {
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

  const sourceInfo = getSourceInfo(currentTrack)

  const handleProgressClick = () => {
    // Would seek to position here if API supported it
  }

  return (
    <section className="bg-surface rounded-2xl border border-border overflow-hidden">
      <div className="flex gap-8 p-8 items-center">
        <AlbumArtwork />
        
        <div className="flex-1 flex flex-col gap-6 min-w-0">
          <TrackInfo 
            title={currentTrack.title}
            source={sourceInfo.text}
            sourceLink={sourceInfo.link || null}
          />
          
          <ProgressBar
            currentTime={currentTime}
            duration={currentTrack.duration || 0}
            onSeek={handleProgressClick}
          />
          
          <PlaybackControls
            isPaused={isPaused}
            onPause={() => pauseMutation.mutate()}
            onSkip={() => skipMutation.mutate()}
            isPauseDisabled={pauseMutation.isPending}
            isSkipDisabled={skipMutation.isPending}
          />
        </div>
      </div>
    </section>
  )
}

