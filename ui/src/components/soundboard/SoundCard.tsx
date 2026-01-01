import type { Sound } from '@/types'
import { escapeHtml, formatSize } from '@/lib/utils'
import type { SoundCustomization } from '@/hooks/useSoundCustomization'

interface SoundCardProps {
  sound: Sound
  customization?: SoundCustomization
  isPlaying: boolean
  isPreviewing: boolean
  isDisabled: boolean
  onPlay: (sound: Sound) => void
  onMenuToggle: (soundName: string) => void
  isMenuOpen: boolean
}

export function SoundCard({
  sound,
  customization,
  isPlaying,
  isPreviewing,
  isDisabled,
  onPlay,
  onMenuToggle,
  isMenuOpen,
}: SoundCardProps) {
  const displayName = customization?.displayName || sound.name.replace(/\.[^/.]+$/, '')
  const emoji = customization?.emoji || '🎵'

  return (
    <div
      onClick={() => !isDisabled && onPlay(sound)}
      className={`
        relative bg-gray-900 border border-gray-700 rounded-xl p-4 
        flex flex-col items-center gap-3 cursor-pointer select-none 
        transition-all duration-200
        hover:border-blue-500 hover:-translate-y-1 hover:shadow-xl hover:shadow-blue-500/20 hover:bg-gray-800
        active:scale-95
        ${isPlaying ? 'border-blue-500 bg-gray-800 animate-pulse' : ''}
        ${isPreviewing ? 'border-purple-500 bg-purple-950/20' : ''}
        ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''}
      `}
      role="button"
      tabIndex={isDisabled ? -1 : 0}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && !isDisabled) {
          e.preventDefault()
          onPlay(sound)
        }
      }}
      aria-label={`Play ${displayName}`}
      aria-disabled={isDisabled}
    >
      {/* Menu Button */}
      <button
        className="absolute top-2 right-2 p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-gray-700 transition-colors z-10"
        onClick={(e) => {
          e.stopPropagation()
          onMenuToggle(sound.name)
        }}
        aria-label="Sound options"
        aria-expanded={isMenuOpen}
      >
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
        </svg>
      </button>

      {/* Emoji Icon */}
      <div className="text-4xl" role="img" aria-label={emoji}>
        {emoji}
      </div>

      {/* Sound Info */}
      <div className="text-center w-full">
        <div
          className="text-sm font-medium text-white whitespace-nowrap overflow-hidden text-ellipsis"
          title={escapeHtml(sound.name)}
        >
          {escapeHtml(displayName)}
        </div>
        <div className="text-xs text-gray-500 font-mono mt-1">{formatSize(sound.size)}</div>
      </div>

      {/* Playing indicator */}
      {isPlaying && (
        <div className="absolute bottom-2 right-2">
          <span className="flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
          </span>
        </div>
      )}

      {/* Preview indicator */}
      {isPreviewing && (
        <div className="absolute bottom-2 left-2 text-xs text-purple-400 flex items-center gap-1">
          <span className="animate-pulse">▶</span>
        </div>
      )}
    </div>
  )
}
