import { useState, useEffect, useCallback } from 'react';
import { Alert, Button, toast } from '@connor-adams/designsystem';
import { buildApiUrl } from '@/lib/api';
import { useGuildStore } from '@/stores/guildStore';
import StatsError from '@/components/common/StatsError';

interface Recording {
  name: string;
  size: number;
  createdAt: string;
}

/**
 * This tab talks to the API with raw `fetch`, not the Axios client the rest of
 * the dashboard uses, so a failure arrives as a plain `Response` with no Axios
 * error shape for `StatsError` to narrow on. Carry the HTTP status on the Error
 * instead, which is the other shape `StatsError` reads — that is what gets a
 * 401/403 the sentence written for it rather than a bare "failed".
 */
function loadError(status: number): Error & { status: number } {
  return Object.assign(new Error(`Failed to load recordings (HTTP ${status})`), { status });
}

/**
 * The error for a failed action, carrying whatever the route said went wrong.
 *
 * Every `/api` route answers a failure with `{ error: '<sentence>' }`, and those
 * sentences are the useful ones: `requireGuildMember` says "Not a member of this
 * guild", `/play` says "guildId and source are required", `playSound` forwards
 * the worker's own reason. Throwing a fixed string instead threw all of that
 * away and left the user with one message for every possible cause.
 *
 * Deliberately NOT annotating `status` the way `loadError` does: that is what
 * routes `StatsError` into its 401/403 prose, and for an action the route's own
 * wording beats a status-mapped guess ("Not a member of this guild" against
 * "your account lacks the required role to view recordings").
 */
async function actionError(response: Response, fallback: string): Promise<Error> {
  const detail = await response
    .json()
    .then((body: { error?: string }) => body?.error)
    .catch(() => undefined);
  return new Error(detail || `${fallback} (HTTP ${response.status})`);
}

export default function RecordingsTab() {
  const { selectedGuildId } = useGuildStore();
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailure, setLoadFailure] = useState<Error | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const [playFailure, setPlayFailure] = useState<{ name: string; error: Error } | null>(null);

  const loadRecordings = useCallback(async () => {
    try {
      setLoading(true);
      setLoadFailure(null);
      const response = await fetch(buildApiUrl('/recordings'), {
        credentials: 'include',
      });
      if (!response.ok) throw loadError(response.status);
      const data = await response.json();
      setRecordings(data);
    } catch (error) {
      // The toast alone used to be the whole error path: it expired after four
      // seconds and left the user looking at "No voice recordings yet", which
      // is a different claim entirely. Keep it for the nudge, but hold the
      // failure in state so the view can say so for as long as it is true.
      setLoadFailure(error as Error);
      toast.error((error as Error).message);
    } finally {
      setLoading(false);
    }
    // `toast` is a module-level function, not state, so this callback has no
    // dependencies and cannot re-fire the load effect on a re-render.
  }, []);

  useEffect(() => {
    loadRecordings();
  }, [loadRecordings]);

  /**
   * `POST /api/play` reads `{ guildId, source }` and 400s with "guildId and
   * source are required" if either is absent — this used to send `{ sound }`
   * and no guild at all, so it had never once reached playback. The guild comes
   * from the header's picker, the same store every other tab plays through.
   */
  const playRecording = async (name: string) => {
    if (!selectedGuildId) return;

    try {
      setPlaying(name);
      setPlayFailure(null);
      const response = await fetch(buildApiUrl('/play'), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guildId: selectedGuildId, source: `records/${name}` }),
      });

      if (!response.ok) throw await actionError(response, `Failed to play "${name}"`);
      toast.success('Playing recording');
    } catch (error) {
      // Same shape as the load failure: a toast for the nudge, plus state so the
      // reason is still on screen after the toast's four seconds are up.
      setPlayFailure({ name, error: error as Error });
      toast.error((error as Error).message);
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
        credentials: 'include',
      });

      if (!response.ok) throw await actionError(response, `Failed to delete "${name}"`);
      toast.success('Recording deleted');
      loadRecordings();
    } catch (error) {
      toast.error((error as Error).message);
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

  // One element, two placements: on its own when the list failed and there is
  // nothing to fall back on, and above the list when a refresh failed but the
  // previously loaded recordings are still on screen.
  const errorState = loadFailure ? (
    <StatsError
      error={loadFailure}
      subject="recordings"
      actions={
        <Button type="button" variant="outline" size="sm" onClick={() => void loadRecordings()}>
          Retry
        </Button>
      }
    />
  ) : null;

  // A play failure is its own state, not a variant of the load failure: retrying
  // it means playing that recording again, not reloading the list.
  const playErrorState = playFailure ? (
    <StatsError
      error={playFailure.error}
      subject="recordings"
      actions={
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void playRecording(playFailure.name)}
        >
          Retry
        </Button>
      }
    />
  ) : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-text-secondary">Loading recordings...</div>
      </div>
    );
  }

  if (errorState && recordings.length === 0) {
    return <div className="flex flex-col justify-center h-64">{errorState}</div>;
  }

  if (recordings.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-text-secondary">
        <div className="text-4xl mb-4">🎙️</div>
        <div className="text-lg">No voice recordings yet</div>
        <div className="text-sm mt-2">Enable voice commands and speak to create recordings</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-xl sm:text-2xl font-bold text-text-primary">Voice Recordings</h2>
        <button
          onClick={loadRecordings}
          className="px-4 py-2 bg-surface-elevated text-text-primary rounded-lg hover:bg-surface-hover transition-colors w-full sm:w-auto"
        >
          Refresh
        </button>
      </div>

      {!selectedGuildId && (
        <Alert variant="info" title="No server selected">
          Pick a server from the menu in the header to play recordings. Download and delete work
          without one.
        </Alert>
      )}

      {errorState}
      {playErrorState}

      <div className="grid gap-3">
        {recordings.map((recording) => (
          <div
            key={recording.name}
            className="bg-surface-elevated rounded-lg p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between hover:bg-surface-hover transition-colors"
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
                onClick={() => playRecording(recording.name)}
                disabled={playing === recording.name || !selectedGuildId}
                title={selectedGuildId ? undefined : 'Select a server in the header first'}
                className="px-3 py-2 bg-primary text-text-primary rounded-lg hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed transition-colors w-full sm:w-auto"
              >
                {playing === recording.name ? 'Playing...' : 'Play'}
              </button>
              <button
                onClick={() => downloadRecording(recording.name)}
                className="px-3 py-2 bg-surface text-text-primary rounded-lg hover:bg-surface-hover transition-colors w-full sm:w-auto"
              >
                Download
              </button>
              <button
                onClick={() => deleteRecording(recording.name)}
                className="px-3 py-2 bg-danger/10 text-danger-light rounded-lg hover:bg-danger/20 transition-colors w-full sm:w-auto"
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
