import { useQuery } from '@tanstack/react-query'
import { statsApi } from '@/lib/api'
import { Bar } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js'

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend)

interface PerformanceOverall {
  avg_ms: string
  p50_ms: string
  p95_ms: string
  p99_ms: string
  max_ms: string
  min_ms: string
  sample_count: string
}

interface CommandPerformance {
  command_name: string
  count: string
  avg_ms: string
  p50_ms: string
  p95_ms: string
}

export default function PerformanceStats() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['stats', 'performance'],
    queryFn: () => statsApi.performance().then((res) => res.data),
    refetchInterval: 30000,
  })

  if (isLoading) {
    return <div className="stats-loading text-center py-12 text-text-secondary">Loading performance statistics...</div>
  }

  if (error) {
    return (
      <div className="stats-error text-center py-12 text-danger">
        Error: {error instanceof Error ? error.message : 'Unknown error'}
      </div>
    )
  }

  if (!data) return null

  const overall: PerformanceOverall = data.overall || {}
  const byCommand: CommandPerformance[] = data.byCommand || []

  const chartData = {
    labels: byCommand.slice(0, 10).map((c) => c.command_name),
    datasets: [
      {
        label: 'Avg (ms)',
        data: byCommand.slice(0, 10).map((c) => parseFloat(c.avg_ms)),
        backgroundColor: 'rgba(59, 130, 246, 0.5)',
        borderColor: 'rgba(59, 130, 246, 1)',
        borderWidth: 1,
      },
      {
        label: 'P95 (ms)',
        data: byCommand.slice(0, 10).map((c) => parseFloat(c.p95_ms)),
        backgroundColor: 'rgba(239, 68, 68, 0.5)',
        borderColor: 'rgba(239, 68, 68, 1)',
        borderWidth: 1,
      },
    ],
  }

  const hasData = parseInt(overall.sample_count || '0') > 0

  return (
    <div className="space-y-6">
      {/* Overall Percentiles */}
      <div className="bg-surface border border-border rounded-xl p-6">
        <h3 className="text-xl text-text-primary mb-4">Command Latency Overview</h3>
        {hasData ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <div className="bg-surface-elevated rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-blue-400">{overall.avg_ms || 0}ms</div>
              <div className="text-sm text-text-secondary">Average</div>
            </div>
            <div className="bg-surface-elevated rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-green-400">{overall.p50_ms || 0}ms</div>
              <div className="text-sm text-text-secondary">P50 (Median)</div>
            </div>
            <div className="bg-surface-elevated rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-yellow-400">{overall.p95_ms || 0}ms</div>
              <div className="text-sm text-text-secondary">P95</div>
            </div>
            <div className="bg-surface-elevated rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-orange-400">{overall.p99_ms || 0}ms</div>
              <div className="text-sm text-text-secondary">P99</div>
            </div>
            <div className="bg-surface-elevated rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-danger">{overall.max_ms || 0}ms</div>
              <div className="text-sm text-text-secondary">Max</div>
            </div>
            <div className="bg-surface-elevated rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-text-secondary">{overall.sample_count || 0}</div>
              <div className="text-sm text-text-secondary">Samples</div>
            </div>
          </div>
        ) : (
          <div className="text-center text-text-secondary py-8">
            No performance data yet. Execution time tracking will populate as commands are run.
          </div>
        )}
      </div>

      {/* By Command Chart */}
      {byCommand.length > 0 && (
        <div className="bg-surface border border-border rounded-xl p-6">
          <h3 className="text-xl text-text-primary mb-4">Latency by Command (Slowest First)</h3>
          <div className="max-h-[400px]">
            <Bar
              data={chartData}
              options={{
                responsive: true,
                scales: { y: { beginAtZero: true, title: { display: true, text: 'Milliseconds' } } },
              }}
            />
          </div>
        </div>
      )}

      {/* Command Table */}
      {byCommand.length > 0 && (
        <div className="bg-surface border border-border rounded-xl p-6">
          <h3 className="text-xl text-text-primary mb-4">Command Performance Details</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-text-secondary border-b border-border">
                  <th className="pb-2">Command</th>
                  <th className="pb-2">Count</th>
                  <th className="pb-2">Avg (ms)</th>
                  <th className="pb-2">P50 (ms)</th>
                  <th className="pb-2">P95 (ms)</th>
                </tr>
              </thead>
              <tbody>
                {byCommand.map((cmd) => (
                  <tr key={cmd.command_name} className="border-b border-border/50 text-text-secondary">
                    <td className="py-2 font-mono">{cmd.command_name}</td>
                    <td className="py-2">{cmd.count}</td>
                    <td className="py-2">{cmd.avg_ms}</td>
                    <td className="py-2">{cmd.p50_ms}</td>
                    <td className="py-2 text-yellow-400">{cmd.p95_ms}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
