import { useState, useRef, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { soundsApi, playbackApi } from '@/lib/api'
import { useGuildStore } from '@/stores/guildStore'
import { useSoundCustomization } from '@/hooks/useSoundCustomization'
import { useAudioPreview } from '@/hooks/useAudioPreview'
import { useClickOutside } from '@/hooks/useClickOutside'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import { SoundCard } from '@/components/soundboard/SoundCard'
import { SoundMenu } from '@/components/soundboard/SoundMenu'
import { EditModal } from '@/components/soundboard/EditModal'
import { SearchBar } from '@/components/soundboard/SearchBar'
import { EmptyState } from '@/components/soundboard/EmptyState'
import { UploadButton } from '@/components/soundboard/UploadButton'
import type { Sound } from '@/types'
import { trackWebEvent } from '@/lib/webAnalytics'

export default function SoundboardTab() {
  const { selectedGuildId } = useGuildStore()
  const queryClient = useQueryClient()

  // State
  const [searchQuery, setSearchQuery] = useState('')
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [editingSound, setEditingSound] = useState<string | null>(null)

  // Refs
  const menuRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Custom hooks
  const { updateCustomization, deleteCustomization, getCustomization } =
    useSoundCustomization()
  const { previewingSound, playPreview, stopPreview } = useAudioPreview()

  // Close menu when clicking outside
  useClickOutside(menuRef, () => setOpenMenuId(null))

  // Queries
  const { data: sounds = [], isLoading: isLoadingSounds } = useQuery({
    queryKey: ['sounds'],
    queryFn: () => soundsApi.list().then((res) => res.data),
    refetchInterval: 10000,
  })

  // Mutations
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
      deleteCustomization(name)
      stopPreview()
    },
  })

  const playMutation = useMutation({
    mutationFn: (soundName: string) => playbackApi.soundboard(selectedGuildId!, soundName),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['queue', selectedGuildId] })
      queryClient.invalidateQueries({ queryKey: ['bot-status'] })
    },
    onError: (error: Error & { response?: { data?: { error?: string } } }) => {
      const message = error.response?.data?.error || error.message || 'Failed to play sound'
      alert(`Error: ${message}`)
    },
  })

  // Filter sounds based on search query
  const filteredSounds = sounds.filter((sound: Sound) => {
    const custom = getCustomization(sound.name)
    const searchTarget = `${sound.name} ${custom?.displayName || ''} ${custom?.emoji || ''}`.toLowerCase()
    return searchTarget.includes(searchQuery.toLowerCase())
  })

  // Handlers
  const handlePlay = useCallback(
    (sound: Sound) => {
      if (!selectedGuildId) {
        alert('Please select a server first')
        return
      }
      trackWebEvent({
        eventType: 'sound_play',
        eventTarget: sound.name,
        guildId: selectedGuildId,
      })
      playMutation.mutate(sound.name)
    },
    [selectedGuildId, playMutation]
  )

  const handleDelete = useCallback(
    (name: string) => {
      setOpenMenuId(null)
      if (window.confirm(`Delete "${name}"?`)) {
        trackWebEvent({
          eventType: 'sound_delete',
          eventTarget: name,
          guildId: selectedGuildId || undefined,
        })
        deleteMutation.mutate(name)
      }
    },
    [deleteMutation, selectedGuildId]
  )

  const handleEdit = useCallback(
    (soundName: string) => {
      trackWebEvent({
        eventType: 'sound_edit',
        eventTarget: soundName,
        guildId: selectedGuildId || undefined,
      })
      setEditingSound(soundName)
      setOpenMenuId(null)
    },
    [selectedGuildId]
  )

  const handleSaveEdit = useCallback(
    (displayName: string, emoji: string) => {
      if (!editingSound) return
      updateCustomization(editingSound, {
        displayName: displayName || undefined,
        emoji: emoji || undefined,
      })
      setEditingSound(null)
    },
    [editingSound, updateCustomization]
  )

  const handlePreview = useCallback(
    (soundName: string) => {
      trackWebEvent({
        eventType: 'sound_preview',
        eventTarget: soundName,
        guildId: selectedGuildId || undefined,
      })
      playPreview(soundName, soundsApi.previewUrl(soundName))
    },
    [playPreview, selectedGuildId]
  )

  // Keyboard shortcuts
  useKeyboardShortcuts(
    [
      {
        key: 'f',
        ctrlKey: true,
        handler: () => searchInputRef.current?.focus(),
        description: 'Focus search',
      },
      {
        key: 'Escape',
        handler: () => {
          if (openMenuId) {
            setOpenMenuId(null)
          } else if (searchQuery) {
            setSearchQuery('')
          } else {
            stopPreview()
          }
        },
        description: 'Close menu/clear search/stop preview',
      },
    ],
    !editingSound // Disable when modal is open
  )

  return (
    <section className="panel bg-surface rounded-2xl border border-border p-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-lg font-semibold text-text-primary flex items-center gap-2">
          <span className="w-1 h-5 bg-gradient-to-b from-primary to-secondary rounded shadow-glow" />
          Soundboard
          {sounds.length > 0 && (
            <span className="text-sm text-text-secondary font-normal">({sounds.length})</span>
          )}
        </h2>
        <UploadButton
          onUpload={(files) => {
            trackWebEvent({
              eventType: 'sound_upload',
              eventTarget: 'soundboard',
              eventValue: String(files.length),
              guildId: selectedGuildId || undefined,
            })
            uploadMutation.mutate(files)
          }}
          isUploading={uploadMutation.isPending}
        />
      </div>

      {/* Search Bar */}
      <div className="mb-6">
        <SearchBar ref={searchInputRef} value={searchQuery} onChange={setSearchQuery} />
      </div>

      {/* Sounds Grid */}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-4 max-h-[calc(100vh-400px)] overflow-y-auto pr-2">
        {isLoadingSounds ? (
          <div className="col-span-full text-center py-12 text-text-muted">
            <div className="animate-spin text-4xl mb-2">⏳</div>
            <p>Loading sounds...</p>
          </div>
        ) : filteredSounds.length === 0 ? (
          <EmptyState hasSearch={searchQuery.length > 0} searchQuery={searchQuery} />
        ) : (
          filteredSounds.map((sound: Sound) => (
            <div key={sound.name} className="relative">
              <SoundCard
                sound={sound}
                customization={getCustomization(sound.name)}
                isPlaying={playMutation.isPending}
                isPreviewing={previewingSound === sound.name}
                isDisabled={!selectedGuildId || playMutation.isPending}
                onPlay={handlePlay}
                onMenuToggle={setOpenMenuId}
                isMenuOpen={openMenuId === sound.name}
              />
              {openMenuId === sound.name && (
                <SoundMenu
                  ref={menuRef}
                  soundName={sound.name}
                  isPreviewing={previewingSound === sound.name}
                  onPreview={() => handlePreview(sound.name)}
                  onEdit={() => handleEdit(sound.name)}
                  onDelete={() => handleDelete(sound.name)}
                  onClose={() => setOpenMenuId(null)}
                />
              )}
            </div>
          ))
        )}
      </div>

      {/* Edit Modal */}
      {editingSound && (
        <EditModal
          key={editingSound}
          soundName={editingSound}
          initialDisplayName={getCustomization(editingSound)?.displayName}
          initialEmoji={getCustomization(editingSound)?.emoji}
          onSave={handleSaveEdit}
          onCancel={() => setEditingSound(null)}
        />
      )}
    </section>
  )
}
