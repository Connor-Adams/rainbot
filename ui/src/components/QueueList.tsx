import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { botApi } from '@/lib/api'
import { useGuildStore } from '@/stores/guildStore'
import type { Track } from '@/types'
import { escapeHtml, formatDuration } from '@/lib/utils'
import { useState } from 'react'

export default function QueueList() {
  const { selectedGuildId } = useGuildStore()
  const queryClient = useQueryClient()
  const [isClearing, setIsClearing] = useState(false)

  const { data: queueData } = useQuery({
    queryKey: ['queue', selectedGuildId],
    queryFn: () => botApi.getQueue(selectedGuildId!).then((res) => res.data),
    enabled: !!selectedGuildId,
    refetchInterval: 5000,
  })

  const removeMutation = useMutation({
    mutationFn: (index: number) => botApi.removeFromQueue(selectedGuildId!, index),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['queue', selectedGuildId] })
    },
  })

  const clearMutation = useMutation({
    mutationFn: () => botApi.clearQueue(selectedGuildId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['queue', selectedGuildId] })
      setIsClearing(false)
    },
  })

  const handleClear = () => {
    if (window.confirm('Clear the entire queue?')) {
      setIsClearing(true)
      clearMutation.mutate()
    }
  }

  const queue = queueData?.queue || []
  const totalInQueue = queueData?.totalInQueue || 0
  const hasQueue = queue.length > 0 || queueData?.nowPlaying

  if (!selectedGuildId) {
    return (
      <section className="panel queue-panel bg-gray-800 rounded-2xl border border-gray-700 p-6 flex flex-col">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
          <span className="w-1 h-4 bg-gradient-to-b from-blue-500 to-indigo-500 rounded shadow-lg shadow-blue-500/40"></span>
          Queue
        </h2>
        <p className="queue-empty text-center py-8 text-gray-500">Select a server to view queue</p>
      </section>
    )
  }

  return (
    <section className="panel queue-panel bg-gray-800 rounded-2xl border border-gray-700 p-6 flex flex-col">
      <div className="queue-header flex justify-between items-center mb-4">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-2">
          <span className="w-1 h-4 bg-gradient-to-b from-blue-500 to-indigo-500 rounded shadow-lg shadow-blue-500/40"></span>
          Queue
          {queueData?.autoplay && (
            <span className="ml-2 text-xs text-blue-400 font-normal" title="Autoplay enabled">
              🔁
            </span>
          )}
        </h2>
        <div className="flex items-center gap-3">
          <span className="queue-count text-sm font-semibold text-gray-300">{totalInQueue}</span>
          {hasQueue && (
            <button
              className="btn btn-danger btn-small"
              onClick={handleClear}
              disabled={isClearing}
            >
              <span className="btn-icon">🗑</span> Clear
            </button>
          )}
        </div>
      </div>
      <div className="queue-list flex flex-col gap-2 flex-1 overflow-y-auto pr-2 min-h-0">
        {queue.length === 0 ? (
          <p className="queue-empty text-center py-8 text-gray-500">
            <span className="block text-2xl mb-2 opacity-50">🎵</span>
            Queue is empty
            <br />
            <small className="block mt-2 text-sm">Add tracks to start playing</small>
            {queueData?.autoplay && (
              <small className="block mt-3 text-xs text-blue-400">
                🔁 Autoplay is enabled - similar tracks will play automatically
              </small>
            )}
          </p>
        ) : (
          queue.map((track: Track, index: number) => {
            let sourceIcon, sourceText
            if (track.isLocal) {
              sourceIcon = '📁'
              sourceText = 'Local'
            } else if (track.spotifyUrl || track.spotifyId) {
              sourceIcon = '🎵'
              sourceText = 'Spotify'
            } else if (track.url?.includes('youtube')) {
              sourceIcon = '▶️'
              sourceText = 'YouTube'
            } else if (track.url?.includes('soundcloud')) {
              sourceIcon = '🎧'
              sourceText = 'SoundCloud'
            } else {
              sourceIcon = '🎵'
              sourceText = 'Stream'
            }

            return (
              <div key={index} className="queue-item flex items-center gap-3">
                <div className="queue-position">{index + 1}</div>
                <div className="queue-item-info">
                  <div className="queue-item-title" title={escapeHtml(track.title)}>
                    {escapeHtml(track.title)}
                  </div>
                  <div className="queue-item-meta">
                    <span className="queue-item-source">
                      {sourceIcon} {sourceText}
                    </span>
                    {track.duration && <span>{formatDuration(track.duration)}</span>}
                  </div>
                </div>
                <div className="queue-item-actions">
                  <button
                    className="btn btn-danger btn-small remove-queue-item-btn"
                    onClick={() => removeMutation.mutate(index)}
                    title="Remove"
                  >
                    ✕
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>
    </section>
  )
}

