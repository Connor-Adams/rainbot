import { useState } from 'react';
import { useIsMutating, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card } from '@connor-adams/designsystem';
import { soundsApi } from '@/lib/api';
import ConfirmDialog from '@/components/ConfirmDialog';
import { Button } from '@/components/ui';

type SweepResult = {
  converted: number;
  deleted: number;
  skipped: number;
};

// Stable mutation keys so an in-flight sweep is still visible in the query
// client's mutation cache after this section unmounts (switching admin
// sub-tabs unmounts it). Without them `isPending` resets on remount and the
// button re-enables, letting a second concurrent pass be launched.
const TRANSCODE_SWEEP_KEY = ['admin', 'sounds', 'transcode-sweep'] as const;
const STRIP_VIDEO_SWEEP_KEY = ['admin', 'sounds', 'strip-video-sweep'] as const;
const ANALYZE_SWEEP_KEY = ['admin', 'sounds', 'analyze-sweep'] as const;

export default function SoundLibraryMaintenance() {
  const queryClient = useQueryClient();
  const [lastResult, setLastResult] = useState<SweepResult | null>(null);
  const [sweepDialogOpen, setSweepDialogOpen] = useState(false);
  const [stripVideoDialogOpen, setStripVideoDialogOpen] = useState(false);

  const sweepMutation = useMutation({
    mutationKey: TRANSCODE_SWEEP_KEY,
    mutationFn: () => soundsApi.sweepTranscode({ deleteOriginal: true }),
    onSuccess: (res) => {
      setLastResult(res.data || null);
      queryClient.invalidateQueries({ queryKey: ['sounds'] });
    },
  });

  const [stripVideoResult, setStripVideoResult] = useState<string | null>(null);

  const stripVideoMutation = useMutation({
    mutationKey: STRIP_VIDEO_SWEEP_KEY,
    mutationFn: () => soundsApi.sweepStripVideo(),
    onSuccess: (res) => {
      const data = res.data;
      setStripVideoResult(
        `Rewrote ${data.stripped}, archived ${data.archived}, left alone ${data.skipped}, failed ${data.failed}.`
      );
      queryClient.invalidateQueries({ queryKey: ['sounds'] });
    },
    onError: (err: { response?: { data?: { error?: string } }; message?: string }) => {
      setStripVideoResult(err.response?.data?.error ?? err.message ?? 'Video strip sweep failed.');
    },
  });

  const [analyzeResult, setAnalyzeResult] = useState<string | null>(null);

  const analyzeSweepMutation = useMutation({
    mutationKey: ANALYZE_SWEEP_KEY,
    mutationFn: (options: { force: boolean }) => soundsApi.analyzeSweep(options),
    onSuccess: (res) => {
      const data = res.data as { analyzed: number; skipped: number; failed: number };
      setAnalyzeResult(
        `Analyzed ${data.analyzed}, skipped ${data.skipped}, failed ${data.failed}.`
      );
      queryClient.invalidateQueries({ queryKey: ['sound-search'] });
    },
    onError: (err: { response?: { data?: { error?: string } }; message?: string }) => {
      setAnalyzeResult(err.response?.data?.error ?? err.message ?? 'Analysis sweep failed.');
    },
  });

  // Live from the mutation cache, so it survives this section unmounting.
  const sweepRunning = useIsMutating({ mutationKey: TRANSCODE_SWEEP_KEY }) > 0;
  const stripVideoRunning = useIsMutating({ mutationKey: STRIP_VIDEO_SWEEP_KEY }) > 0;
  const analyzeRunning = useIsMutating({ mutationKey: ANALYZE_SWEEP_KEY }) > 0;

  const handleSweep = () => {
    setSweepDialogOpen(false);
    sweepMutation.mutate();
  };

  const handleStripVideo = () => {
    setStripVideoDialogOpen(false);
    setStripVideoResult(null);
    stripVideoMutation.mutate();
  };

  return (
    <>
      <Card variant="nested" padding="sm" radius="xl">
        <div className="text-sm font-semibold text-text-primary mb-1">Transcode and Cleanup</div>
        <div className="text-xs text-text-secondary mb-4">
          Re-encode all sounds to Ogg Opus and archive non-Ogg originals.
        </div>
        <Button
          type="button"
          variant="primary"
          onClick={() => setSweepDialogOpen(true)}
          disabled={sweepRunning}
        >
          {sweepRunning ? 'Working...' : 'Run Transcode Sweep'}
        </Button>
        {sweepMutation.isError && (
          <div className="mt-3 text-xs text-danger-light">Failed to start sweep.</div>
        )}
        {lastResult && (
          <div className="mt-3 text-xs text-text-secondary">
            Converted: {lastResult.converted} | Deleted: {lastResult.deleted} | Skipped:{' '}
            {lastResult.skipped}
          </div>
        )}
      </Card>

      <Card variant="nested" padding="sm" radius="xl">
        <div className="text-sm font-semibold text-text-primary mb-1">Search Analysis</div>
        <div className="text-xs text-text-secondary mb-4">
          Listen to every sound that has changed since it was last analysed and store a description,
          tags and a transcript so it can be found by what it sounds like or by what is said in it.
          Leaves audio files untouched.
        </div>
        <Button
          type="button"
          variant="primary"
          onClick={() => analyzeSweepMutation.mutate({ force: false })}
          disabled={analyzeRunning}
        >
          {analyzeRunning ? 'Analyzing...' : 'Analyze sounds for search'}
        </Button>
        {analyzeResult && <div className="mt-3 text-xs text-text-secondary">{analyzeResult}</div>}
      </Card>

      <Card variant="nested" padding="sm" radius="xl">
        <div className="text-sm font-semibold text-text-primary mb-1">Strip Hidden Video</div>
        <div className="text-xs text-text-secondary mb-4">
          {/* No count here on purpose: nothing this panel fetches reports how
              many library entries carry a video track - the three sweeps all
              return per-run tallies - so any figure in this sentence would be a
              frozen number from a one-off investigation. The sweep itself
              reports what it found, below. */}
          Some sounds are secretly video files - a picture track sitting alongside the audio - which
          is why speech transcription refuses them. This rewrites every affected sound as audio
          only, keeping the sound itself bit-for-bit identical and its name unchanged. A copy of
          every original is archived first.
        </div>
        <Button
          type="button"
          variant="primary"
          onClick={() => setStripVideoDialogOpen(true)}
          disabled={stripVideoRunning}
        >
          {stripVideoRunning ? 'Rewriting...' : 'Strip video from sounds'}
        </Button>
        {stripVideoResult && (
          <div className="mt-3 text-xs text-text-secondary">{stripVideoResult}</div>
        )}
      </Card>

      <ConfirmDialog
        open={sweepDialogOpen}
        title="Run the transcode sweep?"
        description="This rewrites sound files and deletes the originals. This cannot be undone."
        confirmLabel="Run sweep"
        onCancel={() => setSweepDialogOpen(false)}
        onConfirm={handleSweep}
      />
      <ConfirmDialog
        open={stripVideoDialogOpen}
        title="Strip video from all sounds?"
        description="This rewrites every sound in the library. Originals are archived, not kept in place."
        confirmLabel="Strip video"
        onCancel={() => setStripVideoDialogOpen(false)}
        onConfirm={handleStripVideo}
      />
    </>
  );
}
