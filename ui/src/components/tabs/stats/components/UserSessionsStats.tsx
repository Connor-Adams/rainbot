import { useQuery } from '@tanstack/react-query'
import { statsApi } from '@/lib/api'
import { EmptyState } from '@/components/common'
import { safeInt } from '@/lib/chartSafety'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'

interface SessionSummary {
  total_sessions: string
  unique_users: string
  avg_duration_seconds: string
  total_duration_seconds: string
  avg_tracks_per_session: string
  total_tracks_heard: string
}

interface UserSession {
  session_id: string
  user_id: string
  username: string
  channel_name: string
  started_at: string
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
  sessions: UserSession[]
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

  const summary: SessionSummary = data.summary || {
    total_sessions: '0', unique_users: '0', avg_duration_seconds: '0',
    total_duration_seconds: '0', avg_tracks_per_session: '0', total_tracks_heard: '0',
  }
  const totalSessions = safeInt(summary.total_sessions)
  const sessions = Array.isArray(data.sessions) ? data.sessions : []
  const topListeners = Array.isArray(data.topListeners) ? data.topListeners : []

  if (totalSessions === 0 && sessions.length === 0) {
    return <EmptyState icon="👤" message="No user session data available" submessage="User listening sessions will appear here once users join voice channels" />
  }

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    if (hours > 0) return `${hours}h ${minutes}m`
    return `${minutes}m`
  }

  const chartData = topListeners.slice(0, 10).map((l) => ({
    name: l.username || l.user_id?.substring(0, 8) || 'Unknown',
    value: safeInt(l.total_duration),
  }))

  return (
    <div className="space-y-6">
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
          <div className="text-2xl font-bold text-purple-400">{formatDuration(safeInt(summary.avg_duration_seconds))}</div>
          <div className="text-sm text-gray-400">Avg Duration</div>
        </div>
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-orange-400">{formatDuration(safeInt(summary.total_duration_seconds))}</div>
          <div className="text-sm text-gray-400">Total Duration</div>
        </div>
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-yellow-400">
            {(() => { const avg = parseFloat(summary.avg_tracks_per_session || '0'); return isNaN(avg) ? '0.0' : avg.toFixed(1) })()}
          </div>
          <div className="text-sm text-gray-400">Avg Tracks/Session</div>
        </div>
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-pink-400">{summary.total_tracks_heard || '0'}</div>
          <div className="text-sm text-gray-400">Total Tracks</div>
        </div>
      </div>

      {chartData.length > 0 && (
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
          <h3 className="text-lg text-white mb-4">Top Listeners (by duration)</h3>
          <div style={{ width: '100%', height: Math.max(200, chartData.length * 32) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical" margin={{ left: 80, right: 20 }}>
                <XAxis type="number" tick={{ fill: '#9ca3af', fontSize: 12 }} />
                <YAxis type="category" dataKey="name" tick={{ fill: '#9ca3af', fontSize: 12 }} width={75} />
                <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: 8 }} />
                <Bar dataKey="value" fill="rgb(59, 130, 246)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

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
                    <td className="py-2 px-4">{formatDuration(safeInt(listener.total_duration))}</td>
                    <td className="py-2 px-4">{listener.total_tracks}</td>
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
