import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { soundsApi } from '@/lib/api'

type SweepResult = {
  converted: number
  deleted: number
  skipped: number
}

export default function AdminTab() {
  const queryClient = useQueryClient()
  const [lastResult, setLastResult] = useState<SweepResult | null>(null)

  const sweepMutation = useMutation({
    mutationFn: () => soundsApi.sweepTranscode({ deleteOriginal: true }),
    onSuccess: (res) => {
      setLastResult(res.data || null)
      queryClient.invalidateQueries({ queryKey: ['sounds'] })
    },
  })

  const handleSweep = () => {
    if (!window.confirm('Transcode all sounds to Ogg Opus and archive originals?')) return
    sweepMutation.mutate()
  }

  return (
    <section className="panel bg-surface rounded-2xl border border-border p-4 sm:p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">Admin Tasks</h2>
          <p className="text-sm text-text-secondary">
            Maintenance actions that affect shared storage.
          </p>
        </div>
      </div>

      <div className="space-y-4">
        <div className="rounded-xl border border-border bg-surface-input p-4">
          <div className="text-sm font-semibold text-text-primary mb-1">
            Transcode and Cleanup
          </div>
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
            <div className="mt-3 text-xs text-danger-light">
              Failed to start sweep.
            </div>
          )}
          {lastResult && (
            <div className="mt-3 text-xs text-text-secondary">
              Converted: {lastResult.converted} | Deleted: {lastResult.deleted} | Skipped:{' '}
              {lastResult.skipped}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
