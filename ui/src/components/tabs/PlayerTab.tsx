import { useState, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { playbackApi, botApi } from '@/lib/api'
import { useGuildStore } from '@/stores/guildStore'
import NowPlayingCard from '../NowPlayingCard'

export default function PlayerTab() {
  const { selectedGuildId } = useGuildStore()
  const [urlInput, setUrlInput] = useState('')
  const [localVolumes, setLocalVolumes] = useState<{
    rainbot: number | null
    pranjeet: number | null
    hungerbot: number | null
  }>({ rainbot: null, pranjeet: null, hungerbot: null }) // Only set while dragging
  const volumeDebounceRefs = useRef<{
    rainbot: ReturnType<typeof setTimeout> | null
    pranjeet: ReturnType<typeof setTimeout> | null
    hungerbot: ReturnType<typeof setTimeout> | null
  }>({ rainbot: null, pranjeet: null, hungerbot: null })
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

  const connection = (() => {
    if (botStatus?.connections && selectedGuildId) {
      return botStatus.connections.find(
        (c: { guildId: string }) => c.guildId === selectedGuildId
      )
    }
    return null
  })()

  const serverVolumes = {
    rainbot: connection?.workers?.rainbot?.volume ?? connection?.volume ?? 100,
    pranjeet: connection?.workers?.pranjeet?.volume ?? 80,
    hungerbot: connection?.workers?.hungerbot?.volume ?? 70,
  }

  const volumes = {
    rainbot: localVolumes.rainbot ?? serverVolumes.rainbot,
    pranjeet: localVolumes.pranjeet ?? serverVolumes.pranjeet,
    hungerbot: localVolumes.hungerbot ?? serverVolumes.hungerbot,
  }

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
    mutationFn: (payload: { level: number; botType: 'rainbot' | 'pranjeet' | 'hungerbot' }) =>
      playbackApi.volume(selectedGuildId!, payload.level, payload.botType),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bot-status'] })
    },
    onError: () => {
      setLocalVolumes((prev) => ({ ...prev }))
    },
  })

  const handleVolumeChange = (
    botType: 'rainbot' | 'pranjeet' | 'hungerbot',
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const newVolume = parseInt(e.target.value)
    setLocalVolumes((prev) => ({ ...prev, [botType]: newVolume }))

    // Debounce API call
    const ref = volumeDebounceRefs.current
    if (ref[botType]) clearTimeout(ref[botType]!)
    ref[botType] = setTimeout(() => {
      volumeMutation.mutate({ level: newVolume, botType })
      setLocalVolumes((prev) => ({ ...prev, [botType]: null }))
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

      <section className="panel player-panel bg-surface rounded-2xl border border-border p-6">
          <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-4 flex items-center gap-2">
            <span className="w-1 h-4 bg-gradient-to-b from-primary to-secondary rounded shadow-glow"></span>
            Add to Queue
          </h2>
        <div className="url-player space-y-4">
          <div className="input-group flex gap-3">
            <input
              type="text"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              onKeyPress={handleKeyPress}
              className="flex-1 px-4 py-3 bg-surface-input border border-border rounded-lg text-text-primary text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-all placeholder:text-text-muted"
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
        <div className="volume-control mt-6 pt-6 border-t border-border">
          <div className="flex items-center gap-4">
            <span className="text-text-muted text-sm w-6">
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
            <span className="text-text-muted text-sm font-mono w-12 text-right">
              {volume}%
            </span>
          </div>

          <div className="mt-6 space-y-4">
            <div>
              <div className="flex items-center justify-between text-xs text-text-secondary mb-2">
                <span>Rainbot Volume</span>
                <span>{volumes.rainbot}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={volumes.rainbot}
                onChange={(e) => handleVolumeChange('rainbot', e)}
                className="w-full"
              />
            </div>
            <div>
              <div className="flex items-center justify-between text-xs text-text-secondary mb-2">
                <span>Pranjeet Volume</span>
                <span>{volumes.pranjeet}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={volumes.pranjeet}
                onChange={(e) => handleVolumeChange('pranjeet', e)}
                className="w-full"
              />
            </div>
            <div>
              <div className="flex items-center justify-between text-xs text-text-secondary mb-2">
                <span>Hungerbot Volume</span>
                <span>{volumes.hungerbot}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={volumes.hungerbot}
                onChange={(e) => handleVolumeChange('hungerbot', e)}
                className="w-full"
              />
            </div>
          </div>
        </div>
      </section>
    </>
  )
}

