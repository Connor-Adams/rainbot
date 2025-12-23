import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { soundsApi, playbackApi } from '@/lib/api'
import { useGuildStore } from '@/stores/guildStore'
import type { Sound } from '@/types'
import { escapeHtml, formatSize } from '@/lib/utils'

export default function SoundboardTab() {
  const { selectedGuildId } = useGuildStore()
  const [searchQuery, setSearchQuery] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const queryClient = useQueryClient()

  const { data: sounds = [] } = useQuery({
    queryKey: ['sounds'],
    queryFn: () => soundsApi.list().then((res) => res.data),
    refetchInterval: 10000,
  })

  const uploadMutation = useMutation({
    mutationFn: (files: File[]) => soundsApi.upload(files),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sounds'] })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (name: string) => soundsApi.delete(name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sounds'] })
    },
  })

  const playMutation = useMutation({
    mutationFn: (soundName: string) => playbackApi.play(selectedGuildId!, soundName),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['queue', selectedGuildId] })
      queryClient.invalidateQueries({ queryKey: ['bot-status'] })
    },
    onError: (error: Error & { response?: { data?: { error?: string } } }) => {
      const message = error.response?.data?.error || error.message || 'Failed to play sound'
      alert(`Error: ${message}`)
      console.error('Play error:', error)
    },
  })

  const filteredSounds = sounds.filter((sound: Sound) =>
    sound.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const handleUpload = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length > 0) {
      uploadMutation.mutate(files)
      e.target.value = ''
    }
  }

  const handleDelete = (name: string) => {
    if (window.confirm(`Delete "${name}"?`)) {
      deleteMutation.mutate(name)
    }
  }

  const handlePlay = (name: string) => {
    if (!selectedGuildId) {
      alert('Please select a server first')
      return
    }
    playMutation.mutate(name)
  }

  return (
    <section className="panel sounds-panel bg-gray-800 rounded-2xl border border-gray-700 p-6">
      <div className="panel-header flex justify-between items-center mb-6">
        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
          <span className="w-1 h-5 bg-gradient-to-b from-blue-500 to-indigo-500 rounded shadow-lg shadow-blue-500/40"></span>
          Sound Library
        </h2>
        <div className="upload-area">
          <input
            ref={fileInputRef}
            type="file"
            accept=".mp3,.wav,.ogg,.m4a,.webm,.flac"
            multiple
            hidden
            onChange={handleFileChange}
          />
          <button className="btn btn-secondary" onClick={handleUpload} disabled={uploadMutation.isPending}>
            <span className="btn-icon">↑</span> Upload
          </button>
        </div>
      </div>
      <div className="search-bar mb-6 relative">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full px-4 py-3 pr-10 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all placeholder:text-gray-500"
          placeholder="Search sounds..."
        />
        {searchQuery && (
          <button
            className="clear-btn absolute right-2 top-1/2 -translate-y-1/2 bg-transparent border-none text-gray-500 cursor-pointer p-1 flex items-center justify-center rounded transition-all hover:bg-gray-800 hover:text-white"
            onClick={() => setSearchQuery('')}
          >
            ✕
          </button>
        )}
      </div>
      <div className="sounds-grid grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-5 max-h-[calc(100vh-400px)] overflow-y-auto pr-2">
        {filteredSounds.length === 0 ? (
          <div className="col-span-full">
            <p className="empty-state text-gray-500 text-sm text-center py-8 px-6 flex flex-col items-center gap-2">
              <span className="text-2xl opacity-50">
                {searchQuery ? '🔍' : '📭'}
              </span>
              {searchQuery ? 'No matching sounds' : 'No sounds uploaded yet'}
              {!searchQuery && (
                <small className="block mt-2 text-xs">Upload your first sound to get started</small>
              )}
            </p>
          </div>
        ) : (
          filteredSounds.map((sound: Sound) => (
            <div
              key={sound.name}
              className="sound-card bg-gray-900 border border-gray-700 rounded-lg p-4 flex flex-col gap-3 transition-all hover:border-blue-500 hover:-translate-y-1 hover:scale-[1.02] hover:shadow-xl hover:shadow-blue-500/20 hover:bg-gray-800"
            >
              <div className="sound-icon text-3xl text-center">🎵</div>
              <div className="sound-info flex flex-col gap-1 flex-1">
                <div
                  className="sound-name text-sm font-medium text-white whitespace-nowrap overflow-hidden text-ellipsis text-center"
                  title={escapeHtml(sound.name)}
                >
                  {escapeHtml(sound.name)}
                </div>
                <div className="sound-meta flex items-center justify-center gap-2 flex-wrap">
                  <span className="sound-size text-xs text-gray-500 font-mono">
                    {formatSize(sound.size)}
                  </span>
                </div>
              </div>
              <div className="sound-actions flex gap-2 mt-auto">
                <button
                  className="btn btn-primary btn-small play-sound-btn flex-1"
                  onClick={() => handlePlay(sound.name)}
                  disabled={playMutation.isPending || !selectedGuildId}
                >
                  ▶
                </button>
                <button
                  className="btn btn-danger btn-small delete-sound-btn flex-1"
                  onClick={() => handleDelete(sound.name)}
                  disabled={deleteMutation.isPending}
                >
                  ✕
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  )
}

