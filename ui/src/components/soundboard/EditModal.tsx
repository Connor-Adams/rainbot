import { useState } from 'react'

interface EditModalProps {
  soundName: string
  initialDisplayName?: string
  initialEmoji?: string
  onSave: (displayName: string, emoji: string) => void
  onCancel: () => void
}

export function EditModal({
  soundName,
  initialDisplayName = '',
  initialEmoji = '🎵',
  onSave,
  onCancel,
}: EditModalProps) {
  // Use a key prop on the modal instead of syncing state in useEffect
  // The parent should add key={soundName} to reset state when sound changes
  const [displayName, setDisplayName] = useState(initialDisplayName)
  const [emoji, setEmoji] = useState(initialEmoji)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSave(displayName.trim(), emoji.trim() || '🎵')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onCancel()
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onCancel}
      onKeyDown={handleKeyDown}
    >
      <div
        className="bg-surface rounded-xl border border-border p-6 w-full max-w-md shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="modal-title"
        aria-modal="true"
      >
        <h3 id="modal-title" className="text-lg font-semibold text-white mb-4">
          Customize Sound
        </h3>
        
        <form onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <label htmlFor="emoji-input" className="block text-sm text-text-secondary mb-2">
                Emoji
              </label>
              <input
                id="emoji-input"
                type="text"
                value={emoji}
                onChange={(e) => setEmoji(e.target.value)}
                className="w-full px-4 py-3 bg-surface-input border border-border rounded-lg text-white text-2xl text-center focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                placeholder="🎵"
                maxLength={4}
                autoFocus
              />
            </div>
            
            <div>
              <label htmlFor="name-input" className="block text-sm text-text-secondary mb-2">
                Display Name
              </label>
              <input
                id="name-input"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full px-4 py-3 bg-surface-input border border-border rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                placeholder={soundName.replace(/\.[^/.]+$/, '')}
              />
            </div>
            
            <p className="text-xs text-text-muted flex items-center gap-2">
              <span>📁</span>
              <span className="truncate">{soundName}</span>
            </p>
          </div>
          
          <div className="flex gap-3 mt-6">
            <button
              type="button"
              className="flex-1 px-4 py-2.5 bg-surface-elevated hover:bg-surface-hover text-white rounded-lg transition-colors font-medium"
              onClick={onCancel}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors font-medium"
            >
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
