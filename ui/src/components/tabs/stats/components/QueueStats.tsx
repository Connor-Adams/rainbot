import { useQuery } from '@tanstack/react-query'
import { statsApi } from '@/lib/api'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import type { QueueOperation } from '@/types'

// Safe number parser - returns 0 for any invalid value
function safeInt(val: unknown): number {
  if (val === null || val === undefined) return 0
  const num = typeof val === 'number' ? val : parseInt(String(val), 10)
  if (!Number.isFinite(num)) return 0
  return num
}

export default function QueueStats() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['stats', 'queue'],
    queryFn: () => statsApi.queue().then((res) => res.data),
    refetchInterval: 30000,
  })

  if (isLoading) {
    return <div className="text-center py-12 text-text-secondary">Loading queue statistics...</div>
  }

  if (error) {
    return (
      <div className="text-center py-12 text-danger">
        Error: {error instanceof Error ? error.message : 'Unknown error'}
      </div>
    )
  }

  // Safe data access with defaults
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

  // Prepare Recharts data
  const chartData = validOps.map((o: QueueOperation) => ({
    operation: o.operation_type,
    count: safeInt(o.count),
  }))
  
  // Only render chart if we have valid data
  const canRenderChart = chartData.length > 0

  return (
    <div className="bg-surface border border-border rounded-xl p-6">
      <h3 className="text-xl text-text-primary mb-4">Queue Operations</h3>
      {canRenderChart ? (
        <ResponsiveContainer width="100%" height={400}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#252530" />
            <XAxis dataKey="operation" stroke="#a1a1b0" angle={-45} textAnchor="end" height={100} />
            <YAxis stroke="#a1a1b0" />
            <Tooltip 
              contentStyle={{ backgroundColor: '#181820', border: '1px solid #252530', borderRadius: '8px' }}
              labelStyle={{ color: '#ffffff' }}
            />
            <Bar dataKey="count" fill="#fb923c" />
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <p className="text-text-secondary">No data to display</p>
      )}
    </div>
  )
}

