import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { soundsApi, playbackApi } from '@/lib/api'
import { useGuildStore } from '@/stores/guildStore'
import type { Sound } from '@/types'
import { escapeHtml, formatSize } from '@/lib/utils'

// Store customizations in localStorage
interface SoundCustomization {
  displayName?: string
  emoji?: string
}

function getSoundCustomizations(): Record<string, SoundCustomization> {
  try {
    return JSON.parse(localStorage.getItem('soundCustomizations') || '{}')
  } catch {
    return {}
  }
}

function saveSoundCustomization(soundName: string, customization: SoundCustomization) {
  const all = getSoundCustomizations()
  all[soundName] = customization
  localStorage.setItem('soundCustomizations', JSON.stringify(all))
}

function deleteSoundCustomization(soundName: string) {
  const all = getSoundCustomizations()
  delete all[soundName]
  localStorage.setItem('soundCustomizations', JSON.stringify(all))
}

export default function SoundboardTab() {
  const { selectedGuildId } = useGuildStore()
  const [searchQuery, setSearchQuery] = useState('')
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [editingSound, setEditingSound] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editEmoji, setEditEmoji] = useState('')
  const [customizations, setCustomizations] = useState<Record<string, SoundCustomization>>(getSoundCustomizations)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const queryClient = useQueryClient()

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenuId(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

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
    onSuccess: (_, name) => {
      queryClient.invalidateQueries({ queryKey: ['sounds'] })
      deleteSoundCustomization(name)
      setCustomizations(getSoundCustomizations())
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

  const filteredSounds = sounds.filter((sound: Sound) => {
    const custom = customizations[sound.name]
    const searchTarget = `${sound.name} ${custom?.displayName || ''} ${custom?.emoji || ''}`.toLowerCase()
    return searchTarget.includes(searchQuery.toLowerCase())
  })

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
    setOpenMenuId(null)
    if (window.confirm(`Delete "${name}"?`)) {
      deleteMutation.mutate(name)
    }
  }

  const handlePlay = (name: string, e: React.MouseEvent) => {
    // Don't play if clicking menu
    if ((e.target as HTMLElement).closest('.sound-menu')) return
    
    if (!selectedGuildId) {
      alert('Please select a server first')
      return
    }
    playMutation.mutate(name)
  }

  const handleEdit = (sound: Sound) => {
    const custom = customizations[sound.name]
    setEditingSound(sound.name)
    setEditName(custom?.displayName || '')
    setEditEmoji(custom?.emoji || '🎵')
    setOpenMenuId(null)
  }

  const handleSaveEdit = () => {
    if (!editingSound) return
    saveSoundCustomization(editingSound, {
      displayName: editName.trim() || undefined,
      emoji: editEmoji.trim() || undefined,
    })
    setCustomizations(getSoundCustomizations())
    setEditingSound(null)
  }

  const handleCancelEdit = () => {
    setEditingSound(null)
    setEditName('')
    setEditEmoji('')
  }

  const getDisplayName = (sound: Sound) => {
    const custom = customizations[sound.name]
    return custom?.displayName || sound.name.replace(/\.[^/.]+$/, '')
  }

  const getEmoji = (sound: Sound) => {
    const custom = customizations[sound.name]
    return custom?.emoji || '🎵'
  }

  return (
    <section className="panel sounds-panel bg-gray-800 rounded-2xl border border-gray-700 p-6">
      <div className="panel-header flex justify-between items-center mb-6">
        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
          <span className="w-1 h-5 bg-gradient-to-b from-blue-500 to-indigo-500 rounded shadow-lg shadow-blue-500/40"></span>
          Soundboard
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

      {/* Edit Modal */}
      {editingSound && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={handleCancelEdit}>
          <div className="bg-gray-800 rounded-xl border border-gray-700 p-6 w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-white mb-4">Customize Sound</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-2">Emoji</label>
                <input
                  type="text"
                  value={editEmoji}
                  onChange={(e) => setEditEmoji(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white text-2xl text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="🎵"
                  maxLength={4}
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-2">Display Name</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder={editingSound.replace(/\.[^/.]+$/, '')}
                />
              </div>
              <p className="text-xs text-gray-500">File: {editingSound}</p>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
                onClick={handleCancelEdit}
              >
                Cancel
              </button>
              <button
                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors"
                onClick={handleSaveEdit}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="sounds-grid grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-4 max-h-[calc(100vh-400px)] overflow-y-auto pr-2">
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
              onClick={(e) => handlePlay(sound.name, e)}
              className={`sound-card relative bg-gray-900 border border-gray-700 rounded-xl p-4 flex flex-col items-center gap-2 cursor-pointer select-none transition-all hover:border-blue-500 hover:-translate-y-1 hover:scale-105 hover:shadow-xl hover:shadow-blue-500/20 hover:bg-gray-800 active:scale-95 ${
                playMutation.isPending ? 'opacity-50 pointer-events-none' : ''
              } ${!selectedGuildId ? 'opacity-50' : ''}`}
            >
              {/* Hamburger Menu */}
              <div className="sound-menu absolute top-2 right-2" ref={openMenuId === sound.name ? menuRef : null}>
                <button
                  className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-gray-700 transition-colors"
                  onClick={(e) => {
                    e.stopPropagation()
                    setOpenMenuId(openMenuId === sound.name ? null : sound.name)
                  }}
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                  </svg>
                </button>
                {openMenuId === sound.name && (
                  <div className="absolute right-0 top-full mt-1 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-10 min-w-[140px] overflow-hidden">
                    <button
                      className="w-full px-4 py-2.5 text-left text-sm text-white hover:bg-gray-700 flex items-center gap-2 transition-colors"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleEdit(sound)
                      }}
                    >
                      ✏️ Customize
                    </button>
                    <button
                      className="w-full px-4 py-2.5 text-left text-sm text-red-400 hover:bg-red-500/20 flex items-center gap-2 transition-colors"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDelete(sound.name)
                      }}
                    >
                      🗑️ Delete
                    </button>
                  </div>
                )}
              </div>

              <div className="sound-icon text-4xl">{getEmoji(sound)}</div>
              <div className="sound-info text-center w-full">
                <div
                  className="sound-name text-sm font-medium text-white whitespace-nowrap overflow-hidden text-ellipsis"
                  title={escapeHtml(sound.name)}
                >
                  {escapeHtml(getDisplayName(sound))}
                </div>
                <div className="text-xs text-gray-500 font-mono mt-1">
                  {formatSize(sound.size)}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  )
}

