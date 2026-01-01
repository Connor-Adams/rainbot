import { useQuery } from '@tanstack/react-query'
import { statsApi } from '@/lib/api'
import { Bar } from 'react-chartjs-2'
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js'
import { EmptyState } from '@/components/common'
import { safeInt, safeDateLabel } from '@/lib/chartSafety'

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend)

interface SessionSummary {
  total_sessions: string
  avg_duration_seconds: string
  total_duration_seconds: string
  avg_tracks_per_session: string
  total_tracks: string
  avg_peak_users: string
}

interface Session {
  session_id: string
  guild_id: string
  channel_name: string
  started_at: string
  ended_at: string
  duration_seconds: number
  tracks_played: number
  user_count_peak: number
}

interface DailySession {
  date: string
  sessions: string
  total_duration: string
  total_tracks: string
}

function formatDuration(seconds: number): string {
  if (!seconds) return '0s'
  const hours = Math.floor(seconds / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60
  if (hours > 0) return `${hours}h ${mins}m`
  if (mins > 0) return `${mins}m ${secs}s`
  return `${secs}s`
}

export default function SessionsStats() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['stats', 'sessions'],
    queryFn: () => statsApi.sessions().then((res) => res.data),
    refetchInterval: 30000,
  })

  if (isLoading) {
    return <div className="stats-loading text-center py-12 text-text-secondary">Loading session statistics...</div>
  }

  if (error) {
    return (
      <div className="stats-error text-center py-12 text-danger">
        Error: {error instanceof Error ? error.message : 'Unknown error'}
      </div>
    )
  }

  if (!data) {
    return (
      <EmptyState
        icon="🎵"
        message="No session data available"
        submessage="Session statistics will appear once the bot joins voice channels"
      />
    )
  }

  const summary: SessionSummary = data.summary || {}
  const sessions: Session[] = Array.isArray(data.sessions) ? data.sessions : []
  const daily: DailySession[] = Array.isArray(data.daily) ? data.daily : []

  // Check if there's any meaningful data
  const totalSessions = parseInt(summary.total_sessions || '0') || 0
  if (totalSessions === 0 && sessions.length === 0) {
    return (
      <EmptyState
        icon="🎵"
        message="No voice session data available"
        submessage="Session statistics will appear here once the bot joins voice channels"
      />
    )
  }

  // Prepare safe chart data
  const safeDaily = daily.slice(0, 14).reverse().filter(d => d && d.date)
  const chartLabels = safeDaily.map((d) => safeDateLabel(d.date))
  const chartValues = safeDaily.map((d) => safeInt(d.sessions))
  const canRenderChart = chartLabels.length > 0 && chartValues.every(Number.isFinite)

  const chartData = {
    labels: chartLabels,
    datasets: [{
      label: 'Sessions',
      data: chartValues,
      backgroundColor: 'rgba(34, 197, 94, 0.5)',
      borderColor: 'rgba(34, 197, 94, 1)',
      borderWidth: 1,
    }],
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <div className="bg-surface-elevated rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-green-400">{summary.total_sessions || 0}</div>
          <div className="text-sm text-text-secondary">Total Sessions</div>
        </div>
        <div className="bg-surface-elevated rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-blue-400">
            {formatDuration(safeInt(summary.avg_duration_seconds))}
          </div>
          <div className="text-sm text-text-secondary">Avg Duration</div>
        </div>
        <div className="bg-surface-elevated rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-purple-400">
            {formatDuration(safeInt(summary.total_duration_seconds))}
          </div>
          <div className="text-sm text-text-secondary">Total Time</div>
        </div>
        <div className="bg-surface-elevated rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-yellow-400">{summary.avg_tracks_per_session || 0}</div>
          <div className="text-sm text-text-secondary">Avg Tracks/Session</div>
        </div>
        <div className="bg-surface-elevated rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-orange-400">{summary.total_tracks || 0}</div>
          <div className="text-sm text-text-secondary">Total Tracks</div>
        </div>
        <div className="bg-surface-elevated rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-pink-400">{summary.avg_peak_users || 0}</div>
          <div className="text-sm text-text-secondary">Avg Peak Users</div>
        </div>
      </div>

      {/* Daily Chart */}
      <div className="bg-surface border border-border rounded-xl p-6">
        <h3 className="text-xl text-text-primary mb-4">Sessions per Day</h3>
        <div className="max-h-[300px]">
          <Bar data={chartData} options={{ responsive: true, scales: { y: { beginAtZero: true } } }} />
        </div>
      )}

      {/* Recent Sessions Table */}
      <div className="bg-surface border border-border rounded-xl p-6">
        <h3 className="text-xl text-text-primary mb-4">Recent Sessions</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="text-text-secondary border-b border-border">
                <th className="pb-2">Channel</th>
                <th className="pb-2">Started</th>
                <th className="pb-2">Duration</th>
                <th className="pb-2">Tracks</th>
                <th className="pb-2">Peak Users</th>
              </tr>
            </thead>
            <tbody>
              {sessions.slice(0, 10).map((session) => (
                <tr key={session.session_id} className="border-b border-border/50 text-text-secondary">
                  <td className="py-2">{session.channel_name || 'Unknown'}</td>
                  <td className="py-2">{session.started_at ? new Date(session.started_at).toLocaleString() : 'Unknown'}</td>
                  <td className="py-2">{formatDuration(session.duration_seconds || 0)}</td>
                  <td className="py-2">{session.tracks_played ?? 0}</td>
                  <td className="py-2">{session.user_count_peak ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
