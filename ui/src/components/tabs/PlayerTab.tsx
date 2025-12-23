import { useState, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { playbackApi, botApi } from '@/lib/api'
import { useGuildStore } from '@/stores/guildStore'
import NowPlayingCard from '../NowPlayingCard'

export default function PlayerTab() {
  const { selectedGuildId } = useGuildStore()
  const [urlInput, setUrlInput] = useState('')
  const [localVolume, setLocalVolume] = useState<number | null>(null) // Only set while dragging
  const volumeDebounceRef = useRef<NodeJS.Timeout | null>(null)
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

      <section className="panel player-panel bg-gray-800 rounded-2xl border border-gray-700 p-6">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
          <span className="w-1 h-4 bg-gradient-to-b from-blue-500 to-indigo-500 rounded shadow-lg shadow-blue-500/40"></span>
          Add to Queue
        </h2>
        <div className="url-player space-y-4">
          <div className="input-group flex gap-3">
            <input
              type="text"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              onKeyPress={handleKeyPress}
              className="flex-1 px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all placeholder:text-gray-500"
              placeholder="YouTube, Spotify, SoundCloud, or direct URL..."
            />
          </div>
          <div className="player-controls flex gap-3">
            <button
              className="btn btn-primary"
              onClick={handlePlay}
              disabled={playMutation.isPending || !selectedGuildId}
            >
              <span className="btn-icon">▶</span> Add to Queue
            </button>
            <button
              className="btn btn-danger"
              onClick={() => stopMutation.mutate()}
              disabled={stopMutation.isPending || !selectedGuildId}
            >
              <span className="btn-icon">■</span> Stop
            </button>
          </div>
        </div>

        {/* Volume Control */}
        <div className="volume-control mt-6 pt-6 border-t border-gray-700">
          <div className="flex items-center gap-4">
            <span className="text-gray-400 text-sm w-6">
              {volume === 0 ? '🔇' : volume < 50 ? '🔉' : '🔊'}
            </span>
            <input
              type="range"
              min="0"
              max="100"
              value={volume}
              onChange={handleVolumeChange}
              disabled={!selectedGuildId}
              className="flex-1 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <span className="text-gray-400 text-sm font-mono w-12 text-right">
              {volume}%
            </span>
          </div>
        </div>
      </section>
    </>
  )
}

