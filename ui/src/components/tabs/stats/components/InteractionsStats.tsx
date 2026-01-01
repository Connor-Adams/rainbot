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
  PieChart,
  Pie,
  Cell,
} from 'recharts'

interface InteractionType {
  interaction_type: string
  count: string
}

interface TopAction {
  custom_id: string
  count: string
}

interface ResponseTimeDist {
  under_100ms: string
  between_100_500ms: string
  between_500_1000ms: string
  over_1000ms: string
}

interface InteractionsData {
  typeBreakdown: InteractionType[]
  topActions: TopAction[]
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

  const rtd: ResponseTimeDist = data.responseTimeDistribution || {
    under_100ms: '0', between_100_500ms: '0', between_500_1000ms: '0', over_1000ms: '0',
  }
  const typeBreakdown = Array.isArray(data.typeBreakdown) ? data.typeBreakdown : []
  const topActions = Array.isArray(data.topActions) ? data.topActions : []

  const hasTypeData = typeBreakdown.length > 0
  const hasActionData = topActions.length > 0
  const hasRTData = safeInt(rtd.under_100ms) > 0 || safeInt(rtd.between_100_500ms) > 0 || safeInt(rtd.between_500_1000ms) > 0 || safeInt(rtd.over_1000ms) > 0

  if (!hasTypeData && !hasActionData && !hasRTData) {
    return <EmptyState icon="🔘" message="No interaction data available" submessage="Interaction statistics will appear here once users start using buttons and menus" />
  }

  const typeColors = ['rgb(59, 130, 246)', 'rgb(34, 197, 94)', 'rgb(251, 146, 60)']
  const typeData = typeBreakdown.map((t, idx) => ({
    name: t.interaction_type || 'Unknown',
    value: safeInt(t.count),
    color: typeColors[idx % 3],
  })).filter(d => d.value > 0)

  const rtData = [
    { name: '< 100ms', value: safeInt(rtd.under_100ms), color: 'rgb(34, 197, 94)' },
    { name: '100-500ms', value: safeInt(rtd.between_100_500ms), color: 'rgb(251, 191, 36)' },
    { name: '500-1000ms', value: safeInt(rtd.between_500_1000ms), color: 'rgb(251, 146, 60)' },
    { name: '> 1000ms', value: safeInt(rtd.over_1000ms), color: 'rgb(239, 68, 68)' },
  ].filter(d => d.value > 0)

  const actionData = topActions.slice(0, 10).map((a) => ({
    name: a.custom_id || 'Unknown',
    value: safeInt(a.count),
  }))

  return (
    <div className="space-y-6">
      <div className="grid md:grid-cols-2 gap-6">
        {typeData.length > 0 && (
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
            <h3 className="text-lg text-white mb-4">Interaction Types</h3>
            <div style={{ width: '100%', height: 280 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={typeData}
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
                    {typeData.map((entry, index) => (
                      <Cell key={index} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: 8 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
        
        {rtData.length > 0 && (
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
            <h3 className="text-lg text-white mb-4">Response Time Distribution</h3>
            <div style={{ width: '100%', height: 280 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={rtData}
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
                    {rtData.map((entry, index) => (
                      <Cell key={index} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: 8 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>
      
      {actionData.length > 0 && (
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
          <h3 className="text-lg text-white mb-4">Top Interactions</h3>
          <div style={{ width: '100%', height: Math.max(200, actionData.length * 32) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={actionData} layout="vertical" margin={{ left: 80, right: 20 }}>
                <XAxis type="number" tick={{ fill: '#9ca3af', fontSize: 12 }} />
                <YAxis type="category" dataKey="name" tick={{ fill: '#9ca3af', fontSize: 12 }} width={75} />
                <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: 8 }} />
                <Bar dataKey="value" fill="rgb(168, 85, 247)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {topActions.length > 0 && (
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
          <h3 className="text-xl text-white mb-4">Interaction Details</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-gray-400 border-b border-gray-700">
                  <th className="pb-2 px-4">Custom ID</th>
                  <th className="pb-2 px-4">Count</th>
                </tr>
              </thead>
              <tbody>
                {topActions.slice(0, 15).map((action, idx) => (
                  <tr key={idx} className="border-b border-gray-700/50 text-gray-300">
                    <td className="py-2 px-4 font-mono text-sm">{action.custom_id}</td>
                    <td className="py-2 px-4">{action.count}</td>
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
