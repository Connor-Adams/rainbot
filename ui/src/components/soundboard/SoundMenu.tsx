import { forwardRef } from 'react'
import { soundsApi } from '@/lib/api'

interface SoundMenuProps {
  soundName: string
  isPreviewing: boolean
  onPreview: () => void
  onEdit: () => void
  onDelete: () => void
  onClose: () => void
}

export const SoundMenu = forwardRef<HTMLDivElement, SoundMenuProps>(
  ({ soundName, isPreviewing, onPreview, onEdit, onDelete, onClose }, ref) => {
    return (
      <div
        ref={ref}
        className="absolute right-0 top-full mt-1 bg-surface border border-border rounded-lg shadow-xl z-20 min-w-[150px] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          className="w-full px-4 py-2.5 text-left text-sm text-white hover:bg-surface-elevated flex items-center gap-2 transition-colors"
          onClick={onPreview}
        >
          <span className="w-5">{isPreviewing ? '⏸️' : '▶️'}</span>
          <span>{isPreviewing ? 'Stop' : 'Preview'}</span>
        </button>
        
        <button
          className="w-full px-4 py-2.5 text-left text-sm text-white hover:bg-surface-elevated flex items-center gap-2 transition-colors"
          onClick={onEdit}
        >
          <span className="w-5">✏️</span>
          <span>Customize</span>
        </button>
        
        <a
          href={soundsApi.downloadUrl(soundName)}
          download={soundName}
          className="w-full px-4 py-2.5 text-left text-sm text-white hover:bg-surface-elevated flex items-center gap-2 transition-colors block"
          onClick={(e) => {
            e.stopPropagation()
            onClose()
          }}
        >
          <span className="w-5">⬇️</span>
          <span>Download</span>
        </a>
        
        <div className="border-t border-border" />
        
        <button
          className="w-full px-4 py-2.5 text-left text-sm text-red-400 hover:bg-red-500/20 flex items-center gap-2 transition-colors"
          onClick={onDelete}
        >
          <span className="w-5">🗑️</span>
          <span>Delete</span>
        </button>
      </div>
    )
  }
)

SoundMenu.displayName = 'SoundMenu'
