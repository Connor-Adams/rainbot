import { useQuery } from '@tanstack/react-query'
import { statsApi } from '@/lib/api'
import { Bar, Doughnut } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  ArcElement,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js'

ChartJS.register(ArcElement, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend)

interface TypeBreakdown {
  interaction_type: string
  count: string
  success_count: string
  avg_response_time_ms: string
}

interface TopAction {
  custom_id: string
  interaction_type: string
  count: string
  success_count: string
  avg_response_time_ms: string
}

interface ErrorEntry {
  custom_id: string
  interaction_type: string
  error_message: string
  count: string
}

interface ResponseTimeDist {
  under_100ms: string
  between_100_500ms: string
  between_500_1000ms: string
  over_1000ms: string
}

interface InteractionsData {
  typeBreakdown: TypeBreakdown[]
  topActions: TopAction[]
  errors: ErrorEntry[]
  responseTimeDistribution: ResponseTimeDist
}

export default function InteractionsStats() {
  const { data, isLoading, error } = useQuery<InteractionsData>({
    queryKey: ['stats', 'interactions'],
    queryFn: () => statsApi.interactions().then((r) => r.data),
    refetchInterval: 10000,
  })

  if (isLoading) return <div className="stats-loading text-center py-12">Loading interactions...</div>
  if (error) return <div className="stats-error text-center py-12">Error loading interactions</div>
  if (!data) return null

  const typeBreakdownData = {
    labels: data.typeBreakdown.map((t) => t.interaction_type),
    datasets: [
      {
        data: data.typeBreakdown.map((t) => parseInt(t.count)),
        backgroundColor: [
          'rgba(59, 130, 246, 0.7)',
          'rgba(34, 197, 94, 0.7)',
          'rgba(251, 146, 60, 0.7)',
        ],
        borderColor: ['rgba(59, 130, 246, 1)', 'rgba(34, 197, 94, 1)', 'rgba(251, 146, 60, 1)'],
        borderWidth: 1,
      },
    ],
  }

  const topActionsData = {
    labels: data.topActions.slice(0, 10).map((a) => a.custom_id),
    datasets: [
      {
        label: 'Usage Count',
        data: data.topActions.slice(0, 10).map((a) => parseInt(a.count)),
        backgroundColor: 'rgba(168, 85, 247, 0.6)',
        borderColor: 'rgba(168, 85, 247, 1)',
        borderWidth: 1,
      },
    ],
  }

  const responseTimeData = {
    labels: ['< 100ms', '100-500ms', '500-1000ms', '> 1000ms'],
    datasets: [
      {
        data: [
          parseInt(data.responseTimeDistribution.under_100ms || '0'),
          parseInt(data.responseTimeDistribution.between_100_500ms || '0'),
          parseInt(data.responseTimeDistribution.between_500_1000ms || '0'),
          parseInt(data.responseTimeDistribution.over_1000ms || '0'),
        ],
        backgroundColor: [
          'rgba(34, 197, 94, 0.7)',
          'rgba(251, 191, 36, 0.7)',
          'rgba(251, 146, 60, 0.7)',
          'rgba(239, 68, 68, 0.7)',
        ],
        borderColor: [
          'rgba(34, 197, 94, 1)',
          'rgba(251, 191, 36, 1)',
          'rgba(251, 146, 60, 1)',
          'rgba(239, 68, 68, 1)',
        ],
        borderWidth: 1,
      },
    ],
  }

  return (
    <div className="space-y-6">
      {/* Interaction Type Breakdown */}
      <div className="bg-surface border border-border rounded-xl p-6">
        <h3 className="text-xl text-text-primary mb-4">Interaction Types</h3>
        <div className="max-h-[400px]">
          <Doughnut
            data={typeBreakdownData}
            options={{
              responsive: true,
              plugins: {
                legend: { labels: { color: '#9ca3af' } },
              },
            }}
          />
        </div>
      </div>

      {/* Response Time Distribution */}
      <div className="bg-surface border border-border rounded-xl p-6">
        <h3 className="text-xl text-text-primary mb-4">Response Time Distribution</h3>
        <div className="max-h-[400px]">
          <Doughnut
            data={responseTimeData}
            options={{
              responsive: true,
              plugins: {
                legend: { labels: { color: '#9ca3af' } },
              },
            }}
          />
        </div>
      </div>

      {/* Top Actions */}
      {data.topActions.length > 0 && (
        <div className="bg-surface border border-border rounded-xl p-6">
          <h3 className="text-xl text-text-primary mb-4">Top Interactions</h3>
          <div className="max-h-[400px]">
            <Bar
              data={topActionsData}
              options={{
                responsive: true,
                indexAxis: 'y',
                scales: { x: { beginAtZero: true } },
                plugins: { legend: { labels: { color: '#9ca3af' } } },
              }}
            />
          </div>
        </div>
      )}

      {/* Top Actions Table */}
      {data.topActions.length > 0 && (
        <div className="bg-surface border border-border rounded-xl p-6">
          <h3 className="text-xl text-text-primary mb-4">Interaction Details</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-text-secondary border-b border-border">
                  <th className="pb-2 px-4">Action</th>
                  <th className="pb-2 px-4">Type</th>
                  <th className="pb-2 px-4">Count</th>
                  <th className="pb-2 px-4">Success</th>
                  <th className="pb-2 px-4">Avg Response</th>
                </tr>
              </thead>
              <tbody>
                {data.topActions.slice(0, 10).map((action, idx) => {
                  const count = parseInt(action.count)
                  const successCount = parseInt(action.success_count)
                  const successRate = count > 0 ? (successCount / count) * 100 : 0
                  const successRateDisplay = isNaN(successRate) ? '0.0' : successRate.toFixed(1)
                  return (
                    <tr key={idx} className="border-b border-border/50 text-text-secondary">
                      <td className="py-2 px-4 font-mono text-sm">{action.custom_id}</td>
                      <td className="py-2 px-4">{action.interaction_type}</td>
                      <td className="py-2 px-4">{action.count}</td>
                      <td className="py-2 px-4">
                        <span className={successRate > 95 ? 'text-green-400' : 'text-yellow-400'}>
                          {successRateDisplay}%
                        </span>
                      </td>
                      <td className="py-2 px-4">{action.avg_response_time_ms}ms</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Errors */}
      {data.errors.length > 0 && (
        <div className="bg-surface border border-border rounded-xl p-6">
          <h3 className="text-xl text-text-primary mb-4">Interaction Errors</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-text-secondary border-b border-border">
                  <th className="pb-2 px-4">Action</th>
                  <th className="pb-2 px-4">Type</th>
                  <th className="pb-2 px-4">Error</th>
                  <th className="pb-2 px-4">Count</th>
                </tr>
              </thead>
              <tbody>
                {data.errors.slice(0, 10).map((error, idx) => (
                  <tr key={idx} className="border-b border-border/50 text-text-secondary">
                    <td className="py-2 px-4 font-mono text-sm">{error.custom_id}</td>
                    <td className="py-2 px-4">{error.interaction_type}</td>
                    <td className="py-2 px-4 text-danger text-sm">{error.error_message}</td>
                    <td className="py-2 px-4">{error.count}</td>
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
