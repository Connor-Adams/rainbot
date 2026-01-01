import { useQuery } from '@tanstack/react-query'
import { statsApi } from '@/lib/api'
import { Doughnut } from 'react-chartjs-2'
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js'

ChartJS.register(ArcElement, Tooltip, Legend)

interface ErrorSummary {
  total_errors: string
  unique_commands: string
  most_common_error: string | null
  most_failing_command: string | null
}

interface ErrorByType {
  error_type: string
  count: string
}

interface ErrorByCommand {
  command_name: string
  error_count: string
  success_count: string
  error_rate: string
}

const errorTypeColors: Record<string, string> = {
  validation: 'rgba(239, 68, 68, 0.7)',
  permission: 'rgba(249, 115, 22, 0.7)',
  not_found: 'rgba(234, 179, 8, 0.7)',
  rate_limit: 'rgba(168, 85, 247, 0.7)',
  external_api: 'rgba(59, 130, 246, 0.7)',
  internal: 'rgba(239, 68, 68, 0.9)',
  timeout: 'rgba(156, 163, 175, 0.7)',
  unknown: 'rgba(107, 114, 128, 0.7)',
}

const errorTypeLabels: Record<string, string> = {
  validation: 'Validation',
  permission: 'Permission',
  not_found: 'Not Found',
  rate_limit: 'Rate Limit',
  external_api: 'External API',
  internal: 'Internal',
  timeout: 'Timeout',
  unknown: 'Unknown',
}

export default function ErrorsStats() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['stats', 'errors'],
    queryFn: () => statsApi.errors().then((res) => res.data),
    refetchInterval: 30000,
  })

  if (isLoading) {
    return <div className="stats-loading text-center py-12 text-text-secondary">Loading error statistics...</div>
  }

  if (error) {
    return (
      <div className="stats-error text-center py-12 text-danger">
        Error: {error instanceof Error ? error.message : 'Unknown error'}
      </div>
    )
  }

  if (!data) return null

  const summary: ErrorSummary = data.summary || {}
  const byType: ErrorByType[] = data.byType || []
  const byCommand: ErrorByCommand[] = data.byCommand || []

  const totalErrors = parseInt(summary.total_errors || '0')

  const doughnutData = {
    labels: byType.map((t) => errorTypeLabels[t.error_type] || t.error_type),
    datasets: [
      {
        data: byType.map((t) => parseInt(t.count)),
        backgroundColor: byType.map((t) => errorTypeColors[t.error_type] || errorTypeColors.unknown),
        borderColor: 'rgba(31, 41, 55, 1)',
        borderWidth: 2,
      },
    ],
  }

  return (
    <div className="space-y-6">
      {/* Error Summary */}
      <div className="bg-surface border border-border rounded-xl p-6">
        <h3 className="text-xl text-text-primary mb-4">Error Overview</h3>
        {totalErrors > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-surface-elevated rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-danger">{summary.total_errors || 0}</div>
              <div className="text-sm text-text-secondary">Total Errors</div>
            </div>
            <div className="bg-surface-elevated rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-orange-400">{summary.unique_commands || 0}</div>
              <div className="text-sm text-text-secondary">Affected Commands</div>
            </div>
            <div className="bg-surface-elevated rounded-lg p-4 text-center">
              <div className="text-lg font-bold text-yellow-400 truncate" title={summary.most_common_error || '-'}>
                {summary.most_common_error || '-'}
              </div>
              <div className="text-sm text-text-secondary">Most Common Type</div>
            </div>
            <div className="bg-surface-elevated rounded-lg p-4 text-center">
              <div
                className="text-lg font-bold text-purple-400 truncate font-mono"
                title={summary.most_failing_command || '-'}
              >
                {summary.most_failing_command || '-'}
              </div>
              <div className="text-sm text-text-secondary">Most Failing Command</div>
            </div>
          </div>
        ) : (
          <div className="text-center text-text-secondary py-8">
            No errors recorded. Your bot is running smoothly!
          </div>
        )}
      </div>

      {/* Error Distribution */}
      {byType.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-surface border border-border rounded-xl p-6">
            <h3 className="text-xl text-text-primary mb-4">Errors by Type</h3>
            <div className="max-w-[300px] mx-auto">
              <Doughnut
                data={doughnutData}
                options={{
                  responsive: true,
                  plugins: {
                    legend: {
                      position: 'bottom',
                      labels: { color: '#9ca3af' },
                    },
                  },
                }}
              />
            </div>
          </div>

          <div className="bg-surface border border-border rounded-xl p-6">
            <h3 className="text-xl text-text-primary mb-4">Error Type Breakdown</h3>
            <div className="space-y-3">
              {byType.map((item) => {
                const count = parseInt(item.count)
                const percentage = totalErrors > 0 ? (count / totalErrors) * 100 : 0
                const percentageDisplay = isNaN(percentage) ? '0.0' : percentage.toFixed(1)
                return (
                  <div key={item.error_type} className="flex items-center gap-3">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: errorTypeColors[item.error_type] || errorTypeColors.unknown }}
                    />
                    <span className="text-text-secondary flex-1">{errorTypeLabels[item.error_type] || item.error_type}</span>
                    <span className="text-text-secondary">{count}</span>
                    <span className="text-text-muted text-sm w-16 text-right">{percentageDisplay}%</span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Command Error Rates */}
      {byCommand.length > 0 && (
        <div className="bg-surface border border-border rounded-xl p-6">
          <h3 className="text-xl text-text-primary mb-4">Command Error Rates</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-text-secondary border-b border-border">
                  <th className="pb-2">Command</th>
                  <th className="pb-2">Errors</th>
                  <th className="pb-2">Successes</th>
                  <th className="pb-2">Error Rate</th>
                  <th className="pb-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {byCommand.map((cmd) => {
                  const errorRate = parseFloat(cmd.error_rate || '0')
                  const errorRateDisplay = isNaN(errorRate) ? '0.00' : errorRate.toFixed(2)
                  let statusColor = 'text-green-400'
                  let statusText = 'Healthy'
                  if (errorRate > 10) {
                    statusColor = 'text-danger'
                    statusText = 'Critical'
                  } else if (errorRate > 5) {
                    statusColor = 'text-orange-400'
                    statusText = 'Warning'
                  } else if (errorRate > 1) {
                    statusColor = 'text-yellow-400'
                    statusText = 'Minor'
                  }
                  return (
                    <tr key={cmd.command_name} className="border-b border-border/50 text-text-secondary">
                      <td className="py-2 font-mono">{cmd.command_name}</td>
                      <td className="py-2 text-danger">{cmd.error_count}</td>
                      <td className="py-2 text-green-400">{cmd.success_count}</td>
                      <td className="py-2">{errorRateDisplay}%</td>
                      <td className={`py-2 ${statusColor}`}>{statusText}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
