import { StatsLoading, StatsError, StatsSection, StatsTable } from '@/components/common'
import { useStatsQuery } from '@/hooks/useStatsQuery'
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

interface TopQuery {
  query: string
  query_type: string
  count: string
  avg_results: string
  avg_selected_position: string
}

interface QueryType {
  query_type: string
  count: string
  avg_results: string
}

interface ZeroResult {
  query: string
  query_type: string
  count: string
}

interface SearchData {
  topQueries: TopQuery[]
  queryTypes: QueryType[]
  zeroResults: ZeroResult[]
}

export default function SearchStats() {
  const { data, isLoading, error } = useStatsQuery<SearchData>({
    queryKey: ['stats', 'search'],
    queryFn: () => statsApi.search(),
  })

  if (isLoading) return <StatsLoading message="Loading search statistics..." />
  if (error) return <StatsError error={error} />

  const topQueries = Array.isArray(data?.topQueries) ? data.topQueries : []
  const queryTypes = Array.isArray(data?.queryTypes) ? data.queryTypes : []
  const zeroResults = Array.isArray(data?.zeroResults) ? data.zeroResults : []

  if (!data || topQueries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-8 px-6 text-center">
        <span className="text-3xl opacity-50">🔍</span>
        <p className="text-sm text-text-secondary">No search data available yet</p>
        <small className="text-xs text-text-muted">Search statistics will appear as users search for content</small>
      </div>
    )
  }

  const queryData = topQueries.slice(0, 10).map((q) => ({
    name: (q.query || 'Unknown').substring(0, 20),
    value: safeInt(q.count),
  }))

  const typeColors = ['rgb(59, 130, 246)', 'rgb(34, 197, 94)', 'rgb(251, 146, 60)', 'rgb(168, 85, 247)']
  const typeData = queryTypes.map((t, idx) => ({
    name: t.query_type || 'Unknown',
    value: safeInt(t.count),
    color: typeColors[idx % 4],
  })).filter(d => d.value > 0)

  const columns = [
    { id: 'query', header: 'Query', render: (q: TopQuery) => q.query, className: 'px-4 py-3 text-sm text-text-primary' },
    { id: 'type', header: 'Type', render: (q: TopQuery) => <span className="px-2 py-1 bg-surface-hover rounded text-xs">{q.query_type}</span>, className: 'px-4 py-3 text-sm' },
    { id: 'count', header: 'Count', render: (q: TopQuery) => q.count, className: 'px-4 py-3 text-sm text-text-secondary' },
    { id: 'avg_results', header: 'Avg Results', render: (q: TopQuery) => q.avg_results, className: 'px-4 py-3 text-sm text-text-secondary' },
  ]

  return (
    <div className="space-y-6">
      <div className="grid md:grid-cols-2 gap-6">
        {queryData.length > 0 && (
          <div className="bg-surface border border-border rounded-xl p-6">
            <h3 className="text-lg text-text-primary mb-4">Top Searches</h3>
            <div style={{ width: '100%', height: Math.max(200, queryData.length * 32) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={queryData} layout="vertical" margin={{ left: 80, right: 20 }}>
                  <XAxis type="number" tick={{ fill: '#9ca3af', fontSize: 12 }} />
                  <YAxis type="category" dataKey="name" tick={{ fill: '#9ca3af', fontSize: 12 }} width={75} />
                  <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: 8 }} />
                  <Bar dataKey="value" fill="rgb(59, 130, 246)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
        
        {typeData.length > 0 && (
          <div className="bg-surface border border-border rounded-xl p-6">
            <h3 className="text-lg text-text-primary mb-4">Search Types</h3>
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
      </div>

      <StatsSection title="Search Details">
        <StatsTable columns={columns} data={topQueries.slice(0, 20)} emptyMessage="No search data" getRowKey={(q: TopQuery) => q.query} />
        </StatsSection>

      {zeroResults.length > 0 && (
        <div className="bg-surface border border-border rounded-xl p-6">
          <h3 className="text-xl text-text-primary mb-4">Zero Result Searches</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-text-secondary border-b border-border">
                  <th className="pb-2 px-4">Query</th>
                  <th className="pb-2 px-4">Type</th>
                  <th className="pb-2 px-4">Count</th>
                </tr>
              </thead>
              <tbody>
                {zeroResults.slice(0, 10).map((z, idx) => (
                  <tr key={idx} className="border-b border-border/50 text-text-secondary">
                    <td className="py-2 px-4">{z.query}</td>
                    <td className="py-2 px-4"><span className="px-2 py-1 bg-surface-hover rounded text-xs">{z.query_type}</span></td>
                    <td className="py-2 px-4">{z.count}</td>
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
