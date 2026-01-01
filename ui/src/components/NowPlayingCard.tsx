import { useMutation, useQueryClient } from '@tanstack/react-query'
import { playbackApi } from '@/lib/api'
import type { QueueData } from '@/types'
import { formatDuration } from '@/lib/utils'
import { useState, useEffect } from 'react'

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
  const progressPercentage =
    currentTrack.duration && currentTrack.duration > 0
      ? (currentTime / currentTrack.duration) * 100
      : 0

  const handleProgressClick = () => {
    // Would seek to position here if API supported it
  }

  return (
    <section className="panel now-playing-card bg-gray-800 rounded-2xl border border-gray-700 overflow-hidden">
      <div className="now-playing-content flex gap-8 p-8 items-center">
        <div className="now-playing-artwork relative w-[280px] h-[280px] flex-shrink-0 rounded-2xl overflow-hidden shadow-2xl bg-gray-800">
          <div className="artwork-placeholder">
            <svg viewBox="0 0 280 280" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect width="280" height="280" fill="url(#gradient)" />
              <defs>
                <linearGradient id="gradient" x1="0" y1="0" x2="280" y2="280">
                  <stop offset="0%" style={{ stopColor: '#3b82f6', stopOpacity: 1 }} />
                  <stop offset="100%" style={{ stopColor: '#8b5cf6', stopOpacity: 1 }} />
                </linearGradient>
              </defs>
              <path d="M110 80L190 140L110 200V80Z" fill="white" opacity="0.9" />
            </svg>
          </div>
          <div className="artwork-overlay">
            <div className="equalizer">
              <span></span>
              <span></span>
              <span></span>
              <span></span>
            </div>
          </div>
        </div>
        <div className="now-playing-info flex-1 flex flex-col gap-6 min-w-0">
          <div className="track-info flex flex-col gap-3">
            <div className="track-title text-3xl font-bold text-white overflow-hidden text-ellipsis whitespace-nowrap">
              {currentTrack.title}
            </div>
            <div className="track-artist text-lg text-gray-400 font-medium overflow-hidden text-ellipsis whitespace-nowrap">
              {sourceInfo.text}
            </div>
            {sourceInfo.link && (
              <a
                href={sourceInfo.link}
                className="track-link flex items-center gap-2 mt-1 text-sm text-blue-500 no-underline transition-all w-fit px-3 py-1.5 rounded-lg hover:text-blue-400 hover:bg-blue-500/10"
                target="_blank"
                rel="noopener noreferrer"
              >
                <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                  <polyline points="15 3 21 3 21 9"></polyline>
                  <line x1="10" y1="14" x2="21" y2="3"></line>
                </svg>
                <span className="font-medium">Open in source, BITCH</span>
              </a>
            )}
          </div>
          <div className="progress-container flex flex-col gap-3">
            <div
              className="progress-bar relative w-full h-2 bg-gray-800 rounded-full cursor-pointer overflow-hidden"
              onClick={handleProgressClick}
            >
              <div
                className="progress-fill absolute top-0 left-0 h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full transition-all duration-100 shadow-lg shadow-blue-500/40"
                style={{ width: `${progressPercentage}%` }}
              ></div>
              <div
                className="progress-handle absolute top-1/2 left-0 w-4 h-4 bg-white rounded-full transform -translate-x-1/2 -translate-y-1/2 opacity-0 transition-opacity duration-200 shadow-md cursor-grab active:cursor-grabbing"
                style={{ left: `${progressPercentage}%` }}
              ></div>
            </div>
            <div className="progress-time flex justify-between text-sm text-gray-400 font-mono">
              <span>{formatDuration(currentTime)}</span>
              <span>{formatDuration(currentTrack.duration)}</span>
            </div>
          </div>
          <div className="player-controls-main flex items-center justify-center gap-6">
            <button className="control-btn control-btn-large" title="Previous" disabled>
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
              </svg>
            </button>
            <button
              className="control-btn control-btn-primary control-btn-large"
              onClick={() => pauseMutation.mutate()}
              disabled={pauseMutation.isPending}
              title={isPaused ? 'Resume' : 'Pause'}
            >
              {isPaused ? (
                <svg className="play-icon" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8 5v14l11-7z" />
                </svg>
              ) : (
                <svg className="pause-icon" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M6 4h4v16H6zm8 0h4v16h-4z" />
                </svg>
              )}
            </button>
            <button
              className="control-btn control-btn-large"
              onClick={() => skipMutation.mutate()}
              disabled={skipMutation.isPending}
              title="Next"
            >
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}

