import { useState, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { playbackApi, botApi } from '@/lib/api'
import { useGuildStore } from '@/stores/guildStore'
import NowPlayingCard from '../NowPlayingCard'

export default function PlayerTab() {
  const { selectedGuildId } = useGuildStore()
  const [urlInput, setUrlInput] = useState('')
  const [localVolume, setLocalVolume] = useState<number | null>(null) // Only set while dragging
  const volumeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const queryClient = useQueryClient()

  const { data: queueData } = useQuery({
    queryKey: ['queue', selectedGuildId],
    queryFn: () => botApi.getQueue(selectedGuildId!).then((res) => res.data),
    enabled: !!selectedGuildId,
    refetchInterval: 5000,
  })

  const { data: botStatus } = useQuery({
    queryKey: ['bot-status'],
    queryFn: () => botApi.getStatus().then((res) => res.data),
    refetchInterval: 5000,
  })

  // Derive server volume from bot status
  const serverVolume = (() => {
    if (botStatus?.connections && selectedGuildId) {
      const connection = botStatus.connections.find(
        (c: { guildId: string; volume?: number }) => c.guildId === selectedGuildId
      )
      return connection?.volume ?? 100
    }
    return 100
  })()

  // Use local volume while dragging, otherwise use server volume
  const volume = localVolume ?? serverVolume

  const playMutation = useMutation({
    mutationFn: (source: string) => playbackApi.play(selectedGuildId!, source),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['queue', selectedGuildId] })
      queryClient.invalidateQueries({ queryKey: ['bot-status'] })
      setUrlInput('')
    },
  })

  const stopMutation = useMutation({
    mutationFn: () => playbackApi.stop(selectedGuildId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['queue', selectedGuildId] })
      queryClient.invalidateQueries({ queryKey: ['bot-status'] })
    },
  })

  const volumeMutation = useMutation({
    mutationFn: (level: number) => playbackApi.volume(selectedGuildId!, level),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bot-status'] })
      // Clear local volume after server confirms
      setLocalVolume(null)
    },
    onError: () => {
      setLocalVolume(null)
    },
  })

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseInt(e.target.value)
    setLocalVolume(newVolume)
    
    // Debounce API call
    if (volumeDebounceRef.current) clearTimeout(volumeDebounceRef.current)
    volumeDebounceRef.current = setTimeout(() => {
      volumeMutation.mutate(newVolume)
    }, 150)
  }

  const handlePlay = () => {
    const url = urlInput.trim()
    if (!url) {
      alert('Please enter a URL')
      return
    }
    if (!selectedGuildId) {
      alert('Please select a server first')
      return
    }
    playMutation.mutate(url)
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handlePlay()
    }
  }

  return (
    <>
      {selectedGuildId && queueData?.nowPlaying && (
        <NowPlayingCard queueData={queueData} guildId={selectedGuildId} />
      )}

      <section className="bg-surface rounded-2xl border border-border p-6">
        <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-4 flex items-center gap-2">
          <span className="w-0.5 h-4 bg-gradient-to-b from-primary to-secondary rounded-full shadow-glow" />
          Add to Queue
        </h2>
        <div className="space-y-4">
          <div className="flex gap-3">
            <input
              type="text"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              onKeyPress={handleKeyPress}
              className="flex-1 px-4 py-3 bg-surface-input border border-border rounded-lg text-text-primary text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-all placeholder:text-text-muted hover:border-border-hover"
              placeholder="YouTube, Spotify, SoundCloud, or direct URL..."
            />
          </div>
          <div className="flex gap-3">
            <button
              className="px-6 py-3 bg-gradient-to-r from-primary to-primary-dark text-text-primary font-medium rounded-lg shadow-sm hover:shadow-glow hover:-translate-y-0.5 active:translate-y-0 active:shadow-sm transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              onClick={handlePlay}
              disabled={playMutation.isPending || !selectedGuildId}
            >
              <span>▶</span> Add to Queue
            </button>
            <button
              className="px-6 py-3 bg-gradient-to-r from-danger to-danger-dark text-text-primary font-medium rounded-lg shadow-sm hover:shadow-glow-danger hover:-translate-y-0.5 active:translate-y-0 active:shadow-sm transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              onClick={() => stopMutation.mutate()}
              disabled={stopMutation.isPending || !selectedGuildId}
            >
              <span>■</span> Stop
            </button>
          </div>
        </div>

        {/* Volume Control */}
        <div className="mt-6 pt-6 border-t border-border">
          <div className="flex items-center gap-4">
            <span className="text-text-secondary text-sm w-6">
              {volume === 0 ? '🔇' : volume < 50 ? '🔉' : '🔊'}
            </span>
            <input
              type="range"
              min="0"
              max="100"
              value={volume}
              onChange={handleVolumeChange}
              disabled={!selectedGuildId}
              className="flex-1 h-2 bg-surface-input rounded-lg appearance-none cursor-pointer accent-primary disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <span className="text-text-secondary text-sm font-mono w-12 text-right">
              {volume}%
            </span>
          </div>
        </div>
      </section>
    </>
  )
}

