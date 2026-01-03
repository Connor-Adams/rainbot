import { useState, useEffect } from 'react'
import { useToast } from '../../hooks/useToast'

interface Recording {
  name: string
  size: number
  createdAt: string
}

export default function RecordingsTab() {
  const [recordings, setRecordings] = useState<Recording[]>([])
  const [loading, setLoading] = useState(true)
  const [playing, setPlaying] = useState<string | null>(null)
  const { showToast } = useToast()

  useEffect(() => {
    loadRecordings()
  }, [])

  const loadRecordings = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/recordings')
      if (!response.ok) throw new Error('Failed to load recordings')
      const data = await response.json()
      setRecordings(data)
    } catch (error) {
      showToast((error as Error).message, 'error')
    } finally {
      setLoading(false)
    }
  }

  const playRecording = async (name: string) => {
    try {
      setPlaying(name)
      const response = await fetch('/api/play', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sound: `records/${name}` }),
      })

      if (!response.ok) throw new Error('Failed to play recording')
      showToast('Playing recording', 'success')
    } catch (error) {
      showToast((error as Error).message, 'error')
    } finally {
      setPlaying(null)
    }
  }

  const downloadRecording = (name: string) => {
    window.open(`/api/sounds/records%2F${encodeURIComponent(name)}/download`, '_blank')
  }

  const deleteRecording = async (name: string) => {
    if (!confirm(`Delete recording "${name}"?`)) return

    try {
      const response = await fetch(`/api/sounds/records%2F${encodeURIComponent(name)}`, {
        method: 'DELETE',
      })

      if (!response.ok) throw new Error('Failed to delete recording')
      showToast('Recording deleted', 'success')
      loadRecordings()
    } catch (error) {
      showToast((error as Error).message, 'error')
    }
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleString()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-text-secondary">Loading recordings...</div>
      </div>
    )
  }

  if (recordings.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-text-secondary">
        <div className="text-4xl mb-4">🎙️</div>
        <div className="text-lg">No voice recordings yet</div>
        <div className="text-sm mt-2">Enable voice commands and speak to create recordings</div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-text-primary">Voice Recordings</h2>
        <button
          onClick={loadRecordings}
          className="px-4 py-2 bg-surface-light text-text-primary rounded-lg hover:bg-surface-lighter transition-colors"
        >
          Refresh
        </button>
      </div>

      <div className="grid gap-3">
        {recordings.map((recording) => (
          <div
            key={recording.name}
            className="bg-surface-light rounded-lg p-4 flex items-center justify-between hover:bg-surface-lighter transition-colors"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-lg">🎙️</span>
                <span className="font-medium text-text-primary truncate">{recording.name}</span>
              </div>
              <div className="text-sm text-text-secondary mt-1">
                {formatFileSize(recording.size)} • {formatDate(recording.createdAt)}
              </div>
            </div>

            <div className="flex items-center gap-2 ml-4">
              <button
                onClick={() => playRecording(recording.name)}
                disabled={playing === recording.name}
                className="px-3 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover disabled:opacity-50 transition-colors"
              >
                {playing === recording.name ? 'Playing...' : 'Play'}
              </button>
              <button
                onClick={() => downloadRecording(recording.name)}
                className="px-3 py-2 bg-surface text-text-primary rounded-lg hover:bg-surface-lighter transition-colors"
              >
                Download
              </button>
              <button
                onClick={() => deleteRecording(recording.name)}
                className="px-3 py-2 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
