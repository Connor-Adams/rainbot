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
import { EmptyState } from '@/components/common'

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend)

interface SessionSummary {
  total_sessions: string
  unique_users: string
  avg_duration_seconds: string
  total_duration_seconds: string
  avg_tracks_per_session: string
  total_tracks_heard: string
}

interface Session {
  session_id: string
  user_id: string
  username: string
  guild_id: string
  channel_name: string
  joined_at: string
  left_at: string
  duration_seconds: string
  tracks_heard: string
}

interface TopListener {
  user_id: string
  username: string
  session_count: string
  total_duration: string
  total_tracks: string
}

interface UserSessionsData {
  summary: SessionSummary
  sessions: Session[]
  topListeners: TopListener[]
}

export default function UserSessionsStats() {
  const { data, isLoading, error } = useQuery<UserSessionsData>({
    queryKey: ['stats', 'user-sessions'],
    queryFn: () => statsApi.userSessions().then((r) => r.data),
    refetchInterval: 10000,
  })

  if (isLoading) return <div className="stats-loading text-center py-12">Loading user sessions...</div>
  if (error) return <div className="stats-error text-center py-12">Error loading user sessions</div>
  if (!data) return null

  const summary = data.summary || {}
  const totalSessions = parseInt(summary.total_sessions || '0')
  const sessions = data.sessions || []
  const topListeners = data.topListeners || []

  if (totalSessions === 0 && sessions.length === 0) {
    return (
      <EmptyState
        icon="👤"
        message="No user session data available"
        submessage="User listening sessions will appear here once users join voice channels"
      />
    )
  }

  const topListenersData = {
    labels: topListeners.slice(0, 10).map((l) => l.username || l.user_id.substring(0, 8)),
    datasets: [
      {
        label: 'Total Duration (seconds)',
        data: topListeners.slice(0, 10).map((l) => parseInt(l.total_duration || '0')),
        backgroundColor: 'rgba(59, 130, 246, 0.6)',
        borderColor: 'rgba(59, 130, 246, 1)',
        borderWidth: 1,
      },
    ],
  }

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    if (hours > 0) return `${hours}h ${minutes}m`
    return `${minutes}m`
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-blue-400">{summary.total_sessions || '0'}</div>
          <div className="text-sm text-gray-400">Total Sessions</div>
        </div>
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-green-400">{summary.unique_users || '0'}</div>
          <div className="text-sm text-gray-400">Unique Users</div>
        </div>
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-purple-400">
            {formatDuration(parseInt(summary.avg_duration_seconds || '0'))}
          </div>
          <div className="text-sm text-gray-400">Avg Duration</div>
        </div>
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-orange-400">
            {formatDuration(parseInt(summary.total_duration_seconds || '0'))}
          </div>
          <div className="text-sm text-gray-400">Total Duration</div>
        </div>
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-yellow-400">
            {(() => {
              const avg = parseFloat(summary.avg_tracks_per_session || '0')
              return isNaN(avg) ? '0.0' : avg.toFixed(1)
            })()}
          </div>
          <div className="text-sm text-gray-400">Avg Tracks/Session</div>
        </div>
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-pink-400">{summary.total_tracks_heard || '0'}</div>
          <div className="text-sm text-gray-400">Total Tracks</div>
        </div>
      </div>

      {/* Top Listeners Chart */}
      {topListeners.length > 0 && (
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
          <h3 className="text-xl text-white mb-4">Top Listeners (by duration)</h3>
          <div className="max-h-[400px]">
            <Bar
              data={topListenersData}
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

      {/* Top Listeners Table */}
      {topListeners.length > 0 && (
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
          <h3 className="text-xl text-white mb-4">Top Listeners Details</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-gray-400 border-b border-gray-700">
                  <th className="pb-2 px-4">User</th>
                  <th className="pb-2 px-4">Sessions</th>
                  <th className="pb-2 px-4">Total Duration</th>
                  <th className="pb-2 px-4">Tracks Heard</th>
                </tr>
              </thead>
              <tbody>
                {topListeners.map((listener, idx) => (
                  <tr key={idx} className="border-b border-gray-700/50 text-gray-300">
                    <td className="py-2 px-4">{listener.username || listener.user_id}</td>
                    <td className="py-2 px-4">{listener.session_count}</td>
                    <td className="py-2 px-4">
                      {formatDuration(parseInt(listener.total_duration || '0'))}
                    </td>
                    <td className="py-2 px-4">{listener.total_tracks}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Recent Sessions */}
      {sessions.length > 0 && (
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
          <h3 className="text-xl text-white mb-4">Recent Sessions</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-gray-400 border-b border-gray-700">
                  <th className="pb-2 px-4">User</th>
                  <th className="pb-2 px-4">Channel</th>
                  <th className="pb-2 px-4">Joined</th>
                  <th className="pb-2 px-4">Duration</th>
                  <th className="pb-2 px-4">Tracks</th>
                </tr>
              </thead>
              <tbody>
                {sessions.slice(0, 15).map((session) => (
                  <tr key={session.session_id} className="border-b border-gray-700/50 text-gray-300">
                    <td className="py-2 px-4">{session.username || session.user_id}</td>
                    <td className="py-2 px-4">{session.channel_name}</td>
                    <td className="py-2 px-4 text-sm">
                      {new Date(session.joined_at).toLocaleString()}
                    </td>
                    <td className="py-2 px-4">
                      {formatDuration(parseInt(session.duration_seconds || '0'))}
                    </td>
                    <td className="py-2 px-4">{session.tracks_heard}</td>
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
