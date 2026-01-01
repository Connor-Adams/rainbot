import { useQuery } from '@tanstack/react-query'
import { statsApi } from '@/lib/api'
import { Bar, Doughnut } from 'react-chartjs-2'
import { Chart as ChartJS, ArcElement, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js'
import { EmptyState } from '@/components/common'
import { safeInt, safeString } from '@/lib/chartSafety'

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
  
  // Safe data access with defaults
  const typeBreakdown = Array.isArray(data?.typeBreakdown) ? data.typeBreakdown : []
  const topActions = Array.isArray(data?.topActions) ? data.topActions : []
  const errors = Array.isArray(data?.errors) ? data.errors : []
  const rtd: ResponseTimeDist = data?.responseTimeDistribution || { under_100ms: '0', between_100_500ms: '0', between_500_1000ms: '0', over_1000ms: '0' }

  // Check if there's any meaningful data
  const hasTypeData = typeBreakdown.length > 0
  const hasActionData = topActions.length > 0
  const hasResponseTimeData =
    (parseInt(rtd.under_100ms || '0') || 0) > 0 ||
    (parseInt(rtd.between_100_500ms || '0') || 0) > 0 ||
    (parseInt(rtd.between_500_1000ms || '0') || 0) > 0 ||
    (parseInt(rtd.over_1000ms || '0') || 0) > 0

  if (!data || (!hasTypeData && !hasActionData && !hasResponseTimeData)) {
    return (
      <EmptyState
        icon="🔘"
        message="No interaction data available"
        submessage="Interaction statistics will appear here once users start using buttons and menus"
      />
    )
  }

  // Prepare safe chart data
  const typeLabels = typeBreakdown.map((t) => safeString(t.interaction_type, 'Unknown'))
  const typeValues = typeBreakdown.map((t) => safeInt(t.count))
  const canRenderType = typeLabels.length > 0 && typeValues.every(Number.isFinite) && typeValues.some(v => v > 0)

  const typeBreakdownData = {
    labels: typeLabels,
    datasets: [{
      data: typeValues,
      backgroundColor: ['rgba(59, 130, 246, 0.7)', 'rgba(34, 197, 94, 0.7)', 'rgba(251, 146, 60, 0.7)'],
      borderColor: ['rgba(59, 130, 246, 1)', 'rgba(34, 197, 94, 1)', 'rgba(251, 146, 60, 1)'],
      borderWidth: 1,
    }],
  }

  const responseTimeValues = [safeInt(rtd.under_100ms), safeInt(rtd.between_100_500ms), safeInt(rtd.between_500_1000ms), safeInt(rtd.over_1000ms)]
  const canRenderRT = responseTimeValues.every(Number.isFinite) && responseTimeValues.some(v => v > 0)

  const responseTimeData = {
    labels: ['< 100ms', '100-500ms', '500-1000ms', '> 1000ms'],
    datasets: [{
      data: responseTimeValues,
      backgroundColor: ['rgba(34, 197, 94, 0.7)', 'rgba(251, 191, 36, 0.7)', 'rgba(251, 146, 60, 0.7)', 'rgba(239, 68, 68, 0.7)'],
      borderColor: ['rgba(34, 197, 94, 1)', 'rgba(251, 191, 36, 1)', 'rgba(251, 146, 60, 1)', 'rgba(239, 68, 68, 1)'],
      borderWidth: 1,
    }],
  }

  const actionLabels = topActions.slice(0, 10).map((a) => safeString(a.custom_id, 'Unknown'))
  const actionValues = topActions.slice(0, 10).map((a) => safeInt(a.count))
  const canRenderAction = actionLabels.length > 0 && actionValues.every(Number.isFinite)

  const topActionsData = {
    labels: actionLabels,
    datasets: [{
      label: 'Usage Count',
      data: actionValues,
      backgroundColor: 'rgba(168, 85, 247, 0.6)',
      borderColor: 'rgba(168, 85, 247, 1)',
      borderWidth: 1,
    }],
  }

  return (
    <div className="space-y-6">
      {/* Charts */}
      <div className="grid md:grid-cols-2 gap-6">
        {canRenderType && (
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
            <h3 className="text-xl text-white mb-4">Interaction Types</h3>
            <div className="max-h-[400px]">
              <Doughnut data={typeBreakdownData} options={{ responsive: true, maintainAspectRatio: true, plugins: { legend: { labels: { color: '#9ca3af' } } } }} />
            </div>
          </div>
        )}
        {canRenderRT && (
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
            <h3 className="text-xl text-white mb-4">Response Time Distribution</h3>
            <div className="max-h-[400px]">
              <Doughnut data={responseTimeData} options={{ responsive: true, maintainAspectRatio: true, plugins: { legend: { labels: { color: '#9ca3af' } } } }} />
            </div>
          </div>
        )}
      </div>

      {/* Top Actions */}
      {canRenderAction && (
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
          <h3 className="text-xl text-white mb-4">Top Interactions</h3>
          <div className="max-h-[400px]">
            <Bar data={topActionsData} options={{ responsive: true, maintainAspectRatio: true, indexAxis: 'y', scales: { x: { beginAtZero: true } }, plugins: { legend: { labels: { color: '#9ca3af' } } } }} />
          </div>
        </div>
      )}

      {/* Top Actions Table */}
      {topActions.length > 0 && (
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
          <h3 className="text-xl text-white mb-4">Interaction Details</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-gray-400 border-b border-gray-700">
                  <th className="pb-2 px-4">Action</th>
                  <th className="pb-2 px-4">Type</th>
                  <th className="pb-2 px-4">Count</th>
                  <th className="pb-2 px-4">Success</th>
                  <th className="pb-2 px-4">Avg Response</th>
                </tr>
              </thead>
              <tbody>
                {topActions.slice(0, 10).map((action, idx) => {
                  const count = parseInt(action.count) || 0
                  const successCount = parseInt(action.success_count) || 0
                  const successRate = count > 0 ? (successCount / count) * 100 : 0
                  const successRateDisplay = isNaN(successRate) ? '0.0' : successRate.toFixed(1)
                  return (
                    <tr key={idx} className="border-b border-gray-700/50 text-gray-300">
                      <td className="py-2 px-4 font-mono text-sm">{action.custom_id || 'Unknown'}</td>
                      <td className="py-2 px-4">{action.interaction_type || 'Unknown'}</td>
                      <td className="py-2 px-4">{action.count || '0'}</td>
                      <td className="py-2 px-4">
                        <span className={successRate > 95 ? 'text-green-400' : 'text-yellow-400'}>
                          {successRateDisplay}%
                        </span>
                      </td>
                      <td className="py-2 px-4">{action.avg_response_time_ms || '0'}ms</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Errors */}
      {errors.length > 0 && (
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
          <h3 className="text-xl text-white mb-4">Interaction Errors</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-gray-400 border-b border-gray-700">
                  <th className="pb-2 px-4">Action</th>
                  <th className="pb-2 px-4">Type</th>
                  <th className="pb-2 px-4">Error</th>
                  <th className="pb-2 px-4">Count</th>
                </tr>
              </thead>
              <tbody>
                {errors.slice(0, 10).map((err, idx) => (
                  <tr key={idx} className="border-b border-gray-700/50 text-gray-300">
                    <td className="py-2 px-4 font-mono text-sm">{err.custom_id || 'Unknown'}</td>
                    <td className="py-2 px-4">{err.interaction_type || 'Unknown'}</td>
                    <td className="py-2 px-4 text-red-400 text-sm">{err.error_message || 'Unknown error'}</td>
                    <td className="py-2 px-4">{err.count || '0'}</td>
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
