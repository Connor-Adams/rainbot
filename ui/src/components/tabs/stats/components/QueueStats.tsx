import { useQuery } from '@tanstack/react-query'
import { statsApi } from '@/lib/api'
import type { QueueOperation } from '@/types'
import { safeInt } from '@/lib/chartSafety'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'

export default function QueueStats() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['stats', 'queue'],
    queryFn: () => statsApi.queue().then((res) => res.data),
    refetchInterval: 30000,
  })

  if (isLoading) {
    return <div className="stats-loading text-center py-12 text-text-secondary">Loading queue statistics...</div>
  }

  if (error) {
    return (
      <div className="stats-error text-center py-12 text-danger-light">
        Error: {error instanceof Error ? error.message : 'Unknown error'}
      </div>
    )
  }

  const operations = Array.isArray(data?.operations) ? data.operations : []
  
  if (!data || operations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-8 px-6 text-center">
        <span className="text-3xl opacity-50">📋</span>
        <p className="text-sm text-text-secondary">No queue data available yet</p>
        <small className="text-xs text-text-muted">Queue statistics will appear as users add and manage songs</small>
      </div>
    )
  }

  const chartData = operations.slice(0, 10).map((o: QueueOperation) => ({
    name: o.operation_type || 'Unknown',
    value: safeInt(o.count),
  }))

  return (
    <div className="bg-surface border border-border rounded-xl p-6">
      <h3 className="text-lg text-text-primary mb-4">Queue Operations</h3>
      <div style={{ width: '100%', height: Math.max(200, chartData.length * 32) }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} layout="vertical" margin={{ left: 80, right: 20 }}>
            <XAxis type="number" tick={{ fill: '#9ca3af', fontSize: 12 }} />
            <YAxis type="category" dataKey="name" tick={{ fill: '#9ca3af', fontSize: 12 }} width={75} />
            <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: 8 }} />
            <Bar dataKey="value" fill="rgb(251, 146, 60)" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
