import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { soundsApi } from '@/lib/api';

type SweepResult = {
  converted: number;
  deleted: number;
  skipped: number;
};

export default function SoundLibraryMaintenance() {
  const queryClient = useQueryClient();
  const [lastResult, setLastResult] = useState<SweepResult | null>(null);

  const sweepMutation = useMutation({
    mutationFn: () => soundsApi.sweepTranscode({ deleteOriginal: true }),
    onSuccess: (res) => {
      setLastResult(res.data || null);
      queryClient.invalidateQueries({ queryKey: ['sounds'] });
    },
  });

  const [stripVideoResult, setStripVideoResult] = useState<string | null>(null);

  const stripVideoMutation = useMutation({
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

  const handleSweep = () => {
    if (!window.confirm('Transcode all sounds to Ogg Opus and archive originals?')) return;
    sweepMutation.mutate();
  };

  const handleStripVideo = () => {
    if (
      !window.confirm(
        'Rewrite every sound that secretly contains a video stream as audio only? The originals are archived first.'
      )
    )
      return;
    setStripVideoResult(null);
    stripVideoMutation.mutate();
  };

  return (
    <>
      <div className="rounded-xl border border-border bg-surface-input p-4">
        <div className="text-sm font-semibold text-text-primary mb-1">Transcode and Cleanup</div>
        <div className="text-xs text-text-secondary mb-4">
          Re-encode all sounds to Ogg Opus and archive non-Ogg originals.
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={handleSweep}
          disabled={sweepMutation.isPending}
        >
          {sweepMutation.isPending ? 'Working...' : 'Run Transcode Sweep'}
        </button>
        {sweepMutation.isError && (
          <div className="mt-3 text-xs text-danger-light">Failed to start sweep.</div>
        )}
        {lastResult && (
          <div className="mt-3 text-xs text-text-secondary">
            Converted: {lastResult.converted} | Deleted: {lastResult.deleted} | Skipped:{' '}
            {lastResult.skipped}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-border bg-surface-input p-4">
        <div className="text-sm font-semibold text-text-primary mb-1">Search Analysis</div>
        <div className="text-xs text-text-secondary mb-4">
          Listen to every sound that has changed since it was last analysed and store a description,
          tags and a transcript so it can be found by what it sounds like or by what is said in it.
          Leaves audio files untouched.
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => analyzeSweepMutation.mutate({ force: false })}
          disabled={analyzeSweepMutation.isPending}
        >
          {analyzeSweepMutation.isPending ? 'Analyzing...' : 'Analyze sounds for search'}
        </button>
        {analyzeResult && <div className="mt-3 text-xs text-text-secondary">{analyzeResult}</div>}
      </div>

      <div className="rounded-xl border border-border bg-surface-input p-4">
        <div className="text-sm font-semibold text-text-primary mb-1">Strip Hidden Video</div>
        <div className="text-xs text-text-secondary mb-4">
          Around eighteen sounds are secretly video files - a picture track sitting alongside the
          audio - which is why speech transcription refuses them. This rewrites each one as audio
          only, keeping the sound itself bit-for-bit identical and its name unchanged. A copy of
          every original is archived first.
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={handleStripVideo}
          disabled={stripVideoMutation.isPending}
        >
          {stripVideoMutation.isPending ? 'Rewriting...' : 'Strip video from sounds'}
        </button>
        {stripVideoResult && (
          <div className="mt-3 text-xs text-text-secondary">{stripVideoResult}</div>
        )}
      </div>
    </>
  );
}
