import { useState, useEffect, useCallback } from 'react';
import { useToast } from '../../hooks/useToast';
import { buildApiUrl } from '@/lib/api';

interface Recording {
  name: string;
  size: number;
  createdAt: string;
}

export default function RecordingsTab() {
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [loading, setLoading] = useState(true);
  const [playing, setPlaying] = useState<string | null>(null);
  const { showToast } = useToast();

  const loadRecordings = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(buildApiUrl('/recordings'));
      if (!response.ok) throw new Error('Failed to load recordings');
      const data = await response.json();
      setRecordings(data);
    } catch (error) {
      showToast((error as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadRecordings();
  }, [loadRecordings]);

  const playRecording = async (name: string) => {
    try {
      setPlaying(name);
      const response = await fetch(buildApiUrl('/play'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sound: `records/${name}` }),
      });

      if (!response.ok) throw new Error('Failed to play recording');
      showToast('Playing recording', 'success');
    } catch (error) {
      showToast((error as Error).message, 'error');
    } finally {
      setPlaying(null);
    }
  };

  const downloadRecording = (name: string) => {
    window.open(buildApiUrl(`/sounds/records%2F${encodeURIComponent(name)}/download`), '_blank');
  };

  const deleteRecording = async (name: string) => {
    if (!confirm(`Delete recording "${name}"?`)) return;

    try {
      const response = await fetch(buildApiUrl(`/sounds/records%2F${encodeURIComponent(name)}`), {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('Failed to delete recording');
      showToast('Recording deleted', 'success');
      loadRecordings();
    } catch (error) {
      showToast((error as Error).message, 'error');
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  if (loading) {
    return (
      <div className="surface-panel flex items-center justify-center min-h-[16rem] p-8">
        <div className="text-text-secondary">Loading recordings…</div>
      </div>
    );
  }

  if (recordings.length === 0) {
    return (
      <div className="surface-panel flex flex-col items-center justify-center min-h-[16rem] p-8 text-center text-text-secondary">
        <div className="text-4xl mb-4" aria-hidden>
          🎙️
        </div>
        <div className="text-lg font-medium text-text-primary">No voice recordings yet</div>
        <div className="text-sm mt-2 max-w-sm">
          Enable voice commands and speak to create recordings.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-page-title">Voice recordings</h2>
          <p className="mt-1 text-sm text-text-secondary">Play, download, or delete saved clips.</p>
        </div>
        <button
          type="button"
          onClick={loadRecordings}
          className="btn btn-secondary w-full sm:w-auto"
        >
          Refresh
        </button>
      </div>

      <div className="grid gap-3">
        {recordings.map((recording) => (
          <div
            key={recording.name}
            className="surface-panel p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between transition-colors hover:border-border-hover"
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

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-2 sm:ml-4">
              <button
                type="button"
                onClick={() => playRecording(recording.name)}
                disabled={playing === recording.name}
                className="btn btn-primary w-full sm:w-auto disabled:opacity-50"
              >
                {playing === recording.name ? 'Playing…' : 'Play'}
              </button>
              <button
                type="button"
                onClick={() => downloadRecording(recording.name)}
                className="btn btn-secondary w-full sm:w-auto"
              >
                Download
              </button>
              <button
                type="button"
                onClick={() => deleteRecording(recording.name)}
                className="btn btn-danger w-full sm:w-auto"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
