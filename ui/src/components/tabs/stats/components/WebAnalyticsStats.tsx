import { useQuery } from '@tanstack/react-query'
import { statsApi } from '@/lib/api'
import { safeInt } from '@/lib/chartSafety'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts'

interface EventType {
  event_type: string
  count: string
}

interface TopTarget {
  event_type: string
  event_target: string
  count: string
}

interface ActiveUser {
  period: string
  active_users: string
}

interface GrowthData {
  date: string
  events: string
}

interface WebAnalyticsData {
  eventTypes: EventType[]
  topTargets: TopTarget[]
  activeUsers: ActiveUser[]
  growth: GrowthData[]
}

export default function WebAnalyticsStats() {
  const { data, isLoading, error } = useQuery<WebAnalyticsData>({
    queryKey: ['stats', 'web-analytics'],
    queryFn: () => statsApi.webAnalytics().then((r) => r.data),
    refetchInterval: 30000,
  })

  if (isLoading) return <div className="stats-loading text-center py-12">Loading web analytics...</div>
  if (error) return <div className="stats-error text-center py-12">Error loading web analytics</div>

  const eventTypes = Array.isArray(data?.eventTypes) ? data.eventTypes : []
  const topTargets = Array.isArray(data?.topTargets) ? data.topTargets : []

  if (!data || eventTypes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-8 px-6 text-center">
        <span className="text-3xl opacity-50">📊</span>
        <p className="text-sm text-gray-400">No web analytics data available yet</p>
        <small className="text-xs text-gray-500">Web analytics will appear as users interact with the dashboard</small>
      </div>
    )
  }

  const eventColors = ['rgb(59, 130, 246)', 'rgb(34, 197, 94)', 'rgb(251, 146, 60)', 'rgb(168, 85, 247)']
  const eventData = eventTypes.map((e, idx) => ({
    name: e.event_type || 'Unknown',
    value: safeInt(e.count),
    color: eventColors[idx % 4],
  })).filter(d => d.value > 0)

  const targetData = topTargets.slice(0, 10).map((t) => ({
    name: `${t.event_type}: ${t.event_target}`.substring(0, 25),
    value: safeInt(t.count),
  }))

  return (
    <div className="space-y-6">
      <div className="grid md:grid-cols-2 gap-6">
        {eventData.length > 0 && (
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
            <h3 className="text-lg text-white mb-4">Event Types</h3>
            <div style={{ width: '100%', height: 280 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={eventData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={2}
                    label={({ name, percent }: { name: string; percent: number }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                    labelLine={{ stroke: '#6b7280' }}
                  >
                    {eventData.map((entry, index) => (
                      <Cell key={index} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: 8 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
        
        {targetData.length > 0 && (
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
            <h3 className="text-lg text-white mb-4">Top Event Targets</h3>
            <div style={{ width: '100%', height: Math.max(200, targetData.length * 32) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={targetData} layout="vertical" margin={{ left: 100, right: 20 }}>
                  <XAxis type="number" tick={{ fill: '#9ca3af', fontSize: 12 }} />
                  <YAxis type="category" dataKey="name" tick={{ fill: '#9ca3af', fontSize: 12 }} width={95} />
                  <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: 8 }} />
                  <Bar dataKey="value" fill="rgb(59, 130, 246)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>

      {topTargets.length > 0 && (
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
          <h3 className="text-xl text-white mb-4">Event Details</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-gray-400 border-b border-gray-700">
                  <th className="pb-2 px-4">Event Type</th>
                  <th className="pb-2 px-4">Target</th>
                  <th className="pb-2 px-4">Count</th>
                </tr>
              </thead>
              <tbody>
                {topTargets.slice(0, 15).map((target, idx) => (
                  <tr key={idx} className="border-b border-gray-700/50 text-gray-300">
                    <td className="py-2 px-4">{target.event_type}</td>
                    <td className="py-2 px-4 font-mono text-sm">{target.event_target}</td>
                    <td className="py-2 px-4">{target.count}</td>
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
