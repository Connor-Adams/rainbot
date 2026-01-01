import { useQuery } from '@tanstack/react-query'
import { statsApi } from '@/lib/api'
// CHARTS DISABLED FOR DEBUGGING
import type { QueueOperation } from '@/types'

export default function QueueStats() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['stats', 'queue'],
    queryFn: () => statsApi.queue().then((res) => res.data),
    refetchInterval: 30000,
  })

  if (isLoading) {
    return <div className="stats-loading text-center py-12 text-gray-400">Loading queue statistics...</div>
  }

  if (error) {
    return (
      <div className="stats-error text-center py-12 text-red-400">
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
        <p className="text-sm text-gray-400">No queue data available yet</p>
        <small className="text-xs text-gray-500">Queue statistics will appear as users add and manage songs</small>
      </div>
    )
  }

  return (
    <div className="stats-section bg-gray-800 border border-gray-700 rounded-xl p-6">
      <h3 className="text-xl text-white mb-4">Queue Operations (Charts disabled for debugging)</h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {operations.map((o: QueueOperation, idx: number) => (
          <div key={idx} className="bg-gray-700 p-4 rounded-lg text-center">
            <div className="text-2xl font-bold text-orange-400">{parseInt(o.count) || 0}</div>
            <div className="text-sm text-gray-400">{o.operation_type || 'Unknown'}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

