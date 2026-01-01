import { useQuery } from '@tanstack/react-query'
import { statsApi } from '@/lib/api'
// CHARTS DISABLED FOR DEBUGGING
import { EmptyState } from '@/components/common'

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

  return (
    <div className="space-y-6">
      {/* Event Summary - Charts disabled for debugging */}
      <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
        <h3 className="text-xl text-white mb-4">Guild Events Summary</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {summary.map((s, idx) => (
            <div key={idx} className="bg-gray-700 p-3 rounded text-center">
              <div className={`text-xl font-bold ${s.event_type === 'bot_added' ? 'text-green-400' : 'text-red-400'}`}>
                {parseInt(s.count) || 0}
              </div>
              <div className="text-sm text-gray-400">{(s.event_type || 'Unknown').replace('bot_', '')}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Growth Over Time - Charts disabled */}
      {growth.length > 0 && (
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
          <h3 className="text-xl text-white mb-4">Guild Growth Over Time (Charts disabled)</h3>
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-gray-400 border-b border-gray-700">
                <th className="pb-2">Date</th>
                <th className="pb-2">Joins</th>
                <th className="pb-2">Leaves</th>
              </tr>
            </thead>
            <tbody>
              {growth.slice(-10).map((g, idx) => (
                <tr key={idx} className="border-b border-gray-700/50 text-gray-300">
                  <td className="py-1">{g.date ? new Date(g.date).toLocaleDateString() : 'Unknown'}</td>
                  <td className="py-1 text-green-400">{parseInt(g.joins) || 0}</td>
                  <td className="py-1 text-red-400">{parseInt(g.leaves) || 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
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
