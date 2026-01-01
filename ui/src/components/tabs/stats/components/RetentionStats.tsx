import { useQuery } from '@tanstack/react-query'
import { statsApi } from '@/lib/api'
import { Line } from 'react-chartjs-2'
import '@/lib/chartSetup' // Centralized Chart.js registration
import { EmptyState } from '@/components/common'

interface CohortAnalysis {
  cohort_month: string
  users_joined: string
  still_active: string
  retention_rate: string
}

interface ActiveUsers {
  dau: string
  wau: string
  mau: string
  dau_wau_ratio: string
  dau_mau_ratio: string
}

interface NewUsers {
  today: string
  this_week: string
  this_month: string
}

export default function RetentionStats() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['stats', 'retention'],
    queryFn: () => statsApi.retention().then((res) => res.data),
    refetchInterval: 60000,
  })

  if (isLoading) {
    return <div className="stats-loading text-center py-12 text-gray-400">Loading retention statistics...</div>
  }

  if (error) {
    return (
      <div className="stats-error text-center py-12 text-red-400">
        Error: {error instanceof Error ? error.message : 'Unknown error'}
      </div>
    )
  }

  if (!data) return null

  const cohorts: CohortAnalysis[] = data.cohortAnalysis || []
  const activeUsers: ActiveUsers = data.activeUsers || {}
  const newUsers: NewUsers = data.newUsers || {}

  const dau = parseInt(activeUsers.dau || '0')
  const wau = parseInt(activeUsers.wau || '0')
  const mau = parseInt(activeUsers.mau || '0')
  const dauWauRatio = parseFloat(activeUsers.dau_wau_ratio || '0')
  const dauMauRatio = parseFloat(activeUsers.dau_mau_ratio || '0')
  const dauWauDisplay = isNaN(dauWauRatio) ? '0.0' : (dauWauRatio * 100).toFixed(1)
  const dauMauDisplay = isNaN(dauMauRatio) ? '0.0' : (dauMauRatio * 100).toFixed(1)

  const cohortChartData = {
    labels: cohorts.map((c) => {
      const date = new Date(c.cohort_month)
      return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
    }),
    datasets: [
      {
        label: 'Retention Rate',
        data: cohorts.map((c) => parseFloat(c.retention_rate || '0')),
        borderColor: 'rgba(34, 197, 94, 1)',
        backgroundColor: 'rgba(34, 197, 94, 0.1)',
        fill: true,
        tension: 0.3,
      },
      {
        label: 'Users Joined',
        data: cohorts.map((c) => parseInt(c.users_joined || '0')),
        borderColor: 'rgba(59, 130, 246, 1)',
        backgroundColor: 'transparent',
        fill: false,
        tension: 0.3,
        yAxisID: 'y1',
      },
    ],
  }

  const hasData = mau > 0 || cohorts.length > 0

  if (!hasData) {
    return (
      <EmptyState
        icon="📊"
        message="No retention data available"
        submessage="User retention analytics will appear here as users interact with the bot over time"
      />
    )
  }

  return (
    <div className="space-y-6">
      {/* Active Users */}
      <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
        <h3 className="text-xl text-white mb-4">Active Users</h3>
        {hasData && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            <div className="bg-gray-700 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-blue-400">{dau}</div>
              <div className="text-sm text-gray-400">Daily Active (DAU)</div>
            </div>
            <div className="bg-gray-700 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-green-400">{wau}</div>
              <div className="text-sm text-gray-400">Weekly Active (WAU)</div>
            </div>
            <div className="bg-gray-700 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-purple-400">{mau}</div>
              <div className="text-sm text-gray-400">Monthly Active (MAU)</div>
            </div>
            <div className="bg-gray-700 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-yellow-400">{dauWauDisplay}%</div>
              <div className="text-sm text-gray-400">DAU/WAU Ratio</div>
            </div>
            <div className="bg-gray-700 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-orange-400">{dauMauDisplay}%</div>
              <div className="text-sm text-gray-400">DAU/MAU (Stickiness)</div>
            </div>
          </div>
        )}
      </div>

      {/* New Users */}
      <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
        <h3 className="text-xl text-white mb-4">New Users</h3>
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-gray-700 rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-emerald-400">{newUsers.today || 0}</div>
            <div className="text-sm text-gray-400">Today</div>
          </div>
          <div className="bg-gray-700 rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-teal-400">{newUsers.this_week || 0}</div>
            <div className="text-sm text-gray-400">This Week</div>
          </div>
          <div className="bg-gray-700 rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-cyan-400">{newUsers.this_month || 0}</div>
            <div className="text-sm text-gray-400">This Month</div>
          </div>
        </div>
      </div>

      {/* Cohort Analysis Chart */}
      {cohorts.length > 0 && (
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
          <h3 className="text-xl text-white mb-4">Cohort Retention Over Time</h3>
          <div className="max-h-[400px]">
            <Line
              data={cohortChartData}
              options={{
                responsive: true,
                interaction: {
                  mode: 'index',
                  intersect: false,
                },
                scales: {
                  y: {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    beginAtZero: true,
                    max: 100,
                    title: { display: true, text: 'Retention Rate (%)' },
                  },
                  y1: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    beginAtZero: true,
                    title: { display: true, text: 'Users Joined' },
                    grid: { drawOnChartArea: false },
                  },
                },
                plugins: {
                  legend: {
                    labels: { color: '#9ca3af' },
                  },
                },
              }}
            />
          </div>
        </div>
      )}

      {/* Cohort Table */}
      {cohorts.length > 0 && (
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
          <h3 className="text-xl text-white mb-4">Monthly Cohort Details</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-gray-400 border-b border-gray-700">
                  <th className="pb-2">Cohort</th>
                  <th className="pb-2">Joined</th>
                  <th className="pb-2">Still Active</th>
                  <th className="pb-2">Retention</th>
                </tr>
              </thead>
              <tbody>
                {cohorts.map((cohort) => {
                  const retention = parseFloat(cohort.retention_rate || '0')
                  const retentionDisplay = isNaN(retention) ? '0.0' : retention.toFixed(1)
                  let retentionColor = 'text-green-400'
                  if (retention < 20) {
                    retentionColor = 'text-red-400'
                  } else if (retention < 40) {
                    retentionColor = 'text-orange-400'
                  } else if (retention < 60) {
                    retentionColor = 'text-yellow-400'
                  }

                  return (
                    <tr key={cohort.cohort_month} className="border-b border-gray-700/50 text-gray-300">
                      <td className="py-2">
                        {new Date(cohort.cohort_month).toLocaleDateString('en-US', {
                          month: 'long',
                          year: 'numeric',
                        })}
                      </td>
                      <td className="py-2">{cohort.users_joined}</td>
                      <td className="py-2">{cohort.still_active}</td>
                      <td className={`py-2 ${retentionColor}`}>{retentionDisplay}%</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Stickiness Explanation */}
      <div className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-4">
        <h4 className="text-sm font-medium text-gray-300 mb-2">Understanding Metrics</h4>
        <ul className="text-sm text-gray-400 space-y-1">
          <li>
            <strong>DAU/WAU Ratio:</strong> Higher is better. 40%+ indicates strong daily engagement.
          </li>
          <li>
            <strong>DAU/MAU (Stickiness):</strong> Higher is better. 20%+ is considered good for Discord bots.
          </li>
          <li>
            <strong>Retention Rate:</strong> Percentage of users from a cohort still active in the last 30 days.
          </li>
        </ul>
      </div>
    </div>
  )
}
