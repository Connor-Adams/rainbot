import { useQuery } from '@tanstack/react-query'
import { statsApi } from '@/lib/api'
import { Line, Doughnut } from 'react-chartjs-2'
import '@/lib/chartSetup' // Centralized Chart.js registration
import { EmptyState } from '@/components/common'
import { safeInt, safeDateLabel, safeString } from '@/lib/chartSafety'

interface EventSummary {
  event_type: string
  count: string
}

interface GuildEvent {
  event_type: string
  guild_id: string
  guild_name: string
  member_count: string
  created_at: string
  metadata?: Record<string, unknown>
}

interface GrowthEntry {
  date: string
  joins: string
  leaves: string
}

interface GuildEventsData {
  summary: EventSummary[]
  recentEvents: GuildEvent[]
  growth: GrowthEntry[]
}

export default function GuildEventsStats() {
  const { data, isLoading, error } = useQuery<GuildEventsData>({
    queryKey: ['stats', 'guild-events'],
    queryFn: () => statsApi.guildEvents().then((r) => r.data),
    refetchInterval: 10000,
  })

  if (isLoading) return <div className="stats-loading text-center py-12">Loading guild events...</div>
  if (error) return <div className="stats-error text-center py-12">Error loading guild events</div>

  // Safe data access with defaults
  const summary = Array.isArray(data?.summary) ? data.summary : []
  const recentEvents = Array.isArray(data?.recentEvents) ? data.recentEvents : []
  const growth = Array.isArray(data?.growth) ? data.growth : []

  if (!data || (summary.length === 0 && recentEvents.length === 0)) {
    return (
      <EmptyState
        icon="🏠"
        message="No guild event data available"
        submessage="Guild join/leave events will appear here as the bot is added to or removed from servers"
      />
    )
  }

  // Prepare safe chart data
  const summaryLabels = summary.map((s) => safeString(s.event_type, 'Unknown').replace('bot_', ''))
  const summaryValues = summary.map((s) => safeInt(s.count))
  const canRenderSummary = summaryLabels.length > 0 && summaryValues.every(Number.isFinite) && summaryValues.some(v => v > 0)

  const summaryData = {
    labels: summaryLabels,
    datasets: [{
      data: summaryValues,
      backgroundColor: ['rgba(34, 197, 94, 0.7)', 'rgba(239, 68, 68, 0.7)', 'rgba(59, 130, 246, 0.7)'],
      borderColor: ['rgba(34, 197, 94, 1)', 'rgba(239, 68, 68, 1)', 'rgba(59, 130, 246, 1)'],
      borderWidth: 1,
    }],
  }

  const growthLabels = growth.slice(-30).map((g) => safeDateLabel(g.date))
  const joinValues = growth.slice(-30).map((g) => safeInt(g.joins))
  const leaveValues = growth.slice(-30).map((g) => safeInt(g.leaves))
  const canRenderGrowth = growthLabels.length > 0 && joinValues.every(Number.isFinite) && leaveValues.every(Number.isFinite)

  const growthData = {
    labels: growthLabels,
    datasets: [
      {
        label: 'Joins',
        data: joinValues,
        borderColor: 'rgba(34, 197, 94, 1)',
        backgroundColor: 'rgba(34, 197, 94, 0.1)',
        fill: true,
        tension: 0.3,
      },
      {
        label: 'Leaves',
        data: leaveValues,
        borderColor: 'rgba(239, 68, 68, 1)',
        backgroundColor: 'rgba(239, 68, 68, 0.1)',
        fill: true,
        tension: 0.3,
      },
    ],
  }

  return (
    <div className="space-y-6">
      {/* Event Summary */}
      {canRenderSummary && (
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
          <h3 className="text-xl text-white mb-4">Guild Events Summary</h3>
          <div className="max-h-[400px]">
            <Doughnut data={summaryData} options={{ responsive: true, maintainAspectRatio: true, plugins: { legend: { labels: { color: '#9ca3af' } } } }} />
          </div>
        </div>
      )}

      {/* Growth Over Time */}
      {canRenderGrowth && (
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
          <h3 className="text-xl text-white mb-4">Guild Growth Over Time</h3>
          <div className="max-h-[400px]">
            <Line data={growthData} options={{ responsive: true, maintainAspectRatio: true, interaction: { mode: 'index', intersect: false }, scales: { y: { beginAtZero: true } }, plugins: { legend: { labels: { color: '#9ca3af' } } } }} />
          </div>
        </div>
      )}

      {/* Recent Events */}
      {recentEvents.length > 0 && (
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
          <h3 className="text-xl text-white mb-4">Recent Guild Events</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-gray-400 border-b border-gray-700">
                  <th className="pb-2 px-4">Event</th>
                  <th className="pb-2 px-4">Guild</th>
                  <th className="pb-2 px-4">Members</th>
                  <th className="pb-2 px-4">Date</th>
                </tr>
              </thead>
              <tbody>
                {recentEvents.slice(0, 10).map((event, idx) => (
                  <tr key={idx} className="border-b border-gray-700/50 text-gray-300">
                    <td className="py-2 px-4">
                      <span
                        className={`px-2 py-1 rounded text-xs ${
                          event.event_type === 'bot_added'
                            ? 'bg-green-900/30 text-green-400'
                            : 'bg-red-900/30 text-red-400'
                        }`}
                      >
                        {event.event_type.replace('bot_', '')}
                      </span>
                    </td>
                    <td className="py-2 px-4">{event.guild_name || event.guild_id}</td>
                    <td className="py-2 px-4">{event.member_count}</td>
                    <td className="py-2 px-4 text-sm">
                      {new Date(event.created_at).toLocaleString()}
                    </td>
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
