import { useQuery } from '@tanstack/react-query'
import { statsApi } from '@/lib/api'

export default function ApiLatencyStats() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['stats', 'api-latency'],
    queryFn: () => statsApi.apiLatency().then((r) => r.data),
    refetchInterval: 10000,
  })

  if (isLoading) return <div className="stats-loading text-center py-12">Loading API latency...</div>
  if (error) return <div className="stats-error text-center py-12">Error loading API latency</div>
  if (!data) return null

  return (
    <div className="stats-section bg-gray-800 border border-gray-700 rounded-xl p-6">
      <h3 className="text-xl text-white mb-4">API Latency</h3>
      <pre className="whitespace-pre-wrap text-sm text-gray-300">{JSON.stringify(data, null, 2)}</pre>
    </div>
  )
}
