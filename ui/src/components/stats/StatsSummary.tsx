import { useQuery } from '@tanstack/react-query'
import { statsApi } from '@/lib/api'
import type { StatsSummary as StatsSummaryType } from '@/types'

export default function StatsSummary() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['stats', 'summary'],
    queryFn: () => statsApi.summary().then((res) => res.data as StatsSummaryType),
    refetchInterval: 30000,
  })

  if (isLoading) {
    return <div className="stats-loading text-center py-12 text-gray-400">Loading statistics...</div>
  }

  if (error) {
    return (
      <div className="stats-error text-center py-12 text-red-400">
        Error loading statistics: {error instanceof Error ? error.message : 'Unknown error'}
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="stats-summary space-y-6">
      <div className="stats-cards grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-6">
        <div className="stat-card bg-gray-800 border border-gray-700 rounded-xl p-6 text-center transition-all hover:border-gray-600 hover:-translate-y-0.5 hover:shadow-lg">
          <div className="stat-value text-4xl font-bold text-blue-500 mb-2 font-mono">
            {data.totalCommands.toLocaleString()}
          </div>
          <div className="stat-label text-xs text-gray-400 uppercase tracking-wider">Total Commands</div>
        </div>
        <div className="stat-card bg-gray-800 border border-gray-700 rounded-xl p-6 text-center transition-all hover:border-gray-600 hover:-translate-y-0.5 hover:shadow-lg">
          <div className="stat-value text-4xl font-bold text-blue-500 mb-2 font-mono">
            {data.totalSounds.toLocaleString()}
          </div>
          <div className="stat-label text-xs text-gray-400 uppercase tracking-wider">Sounds Played</div>
        </div>
        <div className="stat-card bg-gray-800 border border-gray-700 rounded-xl p-6 text-center transition-all hover:border-gray-600 hover:-translate-y-0.5 hover:shadow-lg">
          <div className="stat-value text-4xl font-bold text-blue-500 mb-2 font-mono">
            {data.uniqueUsers.toLocaleString()}
          </div>
          <div className="stat-label text-xs text-gray-400 uppercase tracking-wider">Active Users</div>
        </div>
        <div className="stat-card bg-gray-800 border border-gray-700 rounded-xl p-6 text-center transition-all hover:border-gray-600 hover:-translate-y-0.5 hover:shadow-lg">
          <div className="stat-value text-4xl font-bold text-blue-500 mb-2 font-mono">
            {data.uniqueGuilds.toLocaleString()}
          </div>
          <div className="stat-label text-xs text-gray-400 uppercase tracking-wider">Active Guilds</div>
        </div>
        <div className="stat-card bg-gray-800 border border-gray-700 rounded-xl p-6 text-center transition-all hover:border-gray-600 hover:-translate-y-0.5 hover:shadow-lg">
          <div className="stat-value text-4xl font-bold text-blue-500 mb-2 font-mono">
            {data.successRate.toFixed(1)}%
          </div>
          <div className="stat-label text-xs text-gray-400 uppercase tracking-wider">Success Rate</div>
        </div>
      </div>
    </div>
  )
}

