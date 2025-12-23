import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { playbackApi, botApi } from '@/lib/api'
import { useGuildStore } from '@/stores/guildStore'
import NowPlayingCard from '../NowPlayingCard'

export default function PlayerTab() {
  const { selectedGuildId } = useGuildStore()
  const [urlInput, setUrlInput] = useState('')
  const queryClient = useQueryClient()

  const { data: queueData } = useQuery({
    queryKey: ['queue', selectedGuildId],
    queryFn: () => botApi.getQueue(selectedGuildId!).then((res) => res.data),
    enabled: !!selectedGuildId,
    refetchInterval: 5000,
  })

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
      </section>
    </>
  )
}

