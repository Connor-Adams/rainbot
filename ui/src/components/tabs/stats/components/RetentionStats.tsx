import { useQuery } from '@tanstack/react-query'
import { statsApi } from '@/lib/api'
import { EmptyState } from '@/components/common'
import { safeInt, safeDateLabel } from '@/lib/chartSafety'

interface CohortAnalysis {
  cohort_month: string
  users_joined: string
  still_active: string
  retention_rate: string
}

interface ActiveUser {
  period: string
  active_users: string
}

interface ReturningUser {
  period: string
  returning_users: string
  return_rate: string
}

interface RetentionData {
  cohorts: CohortAnalysis[]
  activeUsers: ActiveUser[]
  returning: ReturningUser[]
}

export default function RetentionStats() {
  const { data, isLoading, error } = useQuery<RetentionData>({
    queryKey: ['stats', 'retention'],
    queryFn: () => statsApi.retention().then((r) => r.data),
    refetchInterval: 30000,
  })

  if (isLoading) return <div className="stats-loading text-center py-12">Loading retention...</div>
  if (error) return <div className="stats-error text-center py-12">Error loading retention</div>

  if (!data) {
    return <EmptyState icon="📈" message="No retention data available yet" submessage="Retention statistics will appear here as users interact over time" />
  }

  const cohorts = Array.isArray(data.cohorts) ? data.cohorts : []
  const activeUsers = Array.isArray(data.activeUsers) ? data.activeUsers : []
  const returning = Array.isArray(data.returning) ? data.returning : []

  if (cohorts.length === 0 && activeUsers.length === 0) {
    return <EmptyState icon="📈" message="No retention data available yet" submessage="Retention statistics will appear here as users interact over time" />
  }

  return (
    <div className="space-y-6">
      {activeUsers.length > 0 && (
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
          <h3 className="text-xl text-white mb-4">Active Users Over Time</h3>
          <div className="space-y-2">
            {activeUsers.slice(-14).map((u, idx) => {
              const maxVal = Math.max(...activeUsers.map(x => safeInt(x.active_users)), 1)
              const val = safeInt(u.active_users)
              const pct = (val / maxVal) * 100
              return (
                <div key={idx} className="flex items-center gap-3">
                  <span className="text-xs text-gray-400 w-24">{safeDateLabel(u.period)}</span>
                  <div className="flex-1 bg-gray-700 rounded h-4">
                    <div className="h-full bg-blue-500 rounded" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-xs text-gray-300 w-12 text-right">{val}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {cohorts.length > 0 && (
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
          <h3 className="text-xl text-white mb-4">Cohort Analysis</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-gray-400 border-b border-gray-700">
                  <th className="pb-2 px-4">Cohort</th>
                  <th className="pb-2 px-4">Users Joined</th>
                  <th className="pb-2 px-4">Still Active</th>
                  <th className="pb-2 px-4">Retention Rate</th>
                </tr>
              </thead>
              <tbody>
                {cohorts.map((cohort, idx) => (
                  <tr key={idx} className="border-b border-gray-700/50 text-gray-300">
                    <td className="py-2 px-4">{safeDateLabel(cohort.cohort_month)}</td>
                    <td className="py-2 px-4">{cohort.users_joined}</td>
                    <td className="py-2 px-4">{cohort.still_active}</td>
                    <td className="py-2 px-4">
                      <span className={`px-2 py-1 rounded text-xs ${parseFloat(cohort.retention_rate) > 50 ? 'bg-green-900/30 text-green-400' : 'bg-red-900/30 text-red-400'}`}>
                        {parseFloat(cohort.retention_rate || '0').toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {returning.length > 0 && (
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
          <h3 className="text-xl text-white mb-4">Returning Users</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-gray-400 border-b border-gray-700">
                  <th className="pb-2 px-4">Period</th>
                  <th className="pb-2 px-4">Returning Users</th>
                  <th className="pb-2 px-4">Return Rate</th>
                </tr>
              </thead>
              <tbody>
                {returning.map((r, idx) => (
                  <tr key={idx} className="border-b border-gray-700/50 text-gray-300">
                    <td className="py-2 px-4">{safeDateLabel(r.period)}</td>
                    <td className="py-2 px-4">{r.returning_users}</td>
                    <td className="py-2 px-4">{parseFloat(r.return_rate || '0').toFixed(1)}%</td>
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
