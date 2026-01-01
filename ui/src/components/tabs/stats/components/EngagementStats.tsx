import { useQuery } from '@tanstack/react-query'
import { statsApi } from '@/lib/api'
// CHARTS DISABLED FOR DEBUGGING
import { EmptyState } from '@/components/common'

interface EngagementSummary {
  total_tracks: string
  completed: string
  skipped: string
  avg_played_seconds: string
  avg_completion_percent: string
}

interface SkipReason {
  skip_reason: string | null
  count: string
}

interface TrackStat {
  track_title: string
  skip_count?: string
  completion_count?: string
  avg_skip_position?: string
}

interface EngagementData {
  summary: EngagementSummary
  skipReasons: SkipReason[]
  mostSkipped: TrackStat[]
  mostCompleted: TrackStat[]
}

export default function EngagementStats() {
  const { data, isLoading, error } = useQuery<EngagementData>({
    queryKey: ['stats', 'engagement'],
    queryFn: () => statsApi.engagement().then((r) => r.data),
    refetchInterval: 10000,
  })

  if (isLoading) return <div className="stats-loading text-center py-12">Loading engagement...</div>
  if (error) return <div className="stats-error text-center py-12">Error loading engagement</div>
  
  // Safe data access with defaults
  const summary: EngagementSummary = data?.summary || { total_tracks: '0', completed: '0', skipped: '0', avg_played_seconds: '0', avg_completion_percent: '0' }
  const skipReasons = Array.isArray(data?.skipReasons) ? data.skipReasons : []
  const mostSkipped = Array.isArray(data?.mostSkipped) ? data.mostSkipped : []
  const mostCompleted = Array.isArray(data?.mostCompleted) ? data.mostCompleted : []
  
  const completed = parseInt(summary.completed || '0') || 0
  const skipped = parseInt(summary.skipped || '0') || 0
  const totalTracks = parseInt(summary.total_tracks || '0') || 0
  const avgCompletionPercent = parseFloat(summary.avg_completion_percent || '0')
  const avgCompletionDisplay = isNaN(avgCompletionPercent) ? '0.0' : avgCompletionPercent.toFixed(1)

  if (!data || totalTracks === 0) {
    return (
      <EmptyState
        icon="📈"
        message="No track engagement data available"
        submessage="Engagement statistics will appear here once tracks are played"
      />
    )
  }

  const other = Math.max(0, totalTracks - completed - skipped)

  return (
    <div className="space-y-6">
      {/* Summary Cards - Charts disabled for debugging */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-blue-400">{totalTracks}</div>
          <div className="text-sm text-gray-400">Total Tracks</div>
        </div>
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-green-400">{completed}</div>
          <div className="text-sm text-gray-400">Completed</div>
        </div>
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-red-400">{skipped}</div>
          <div className="text-sm text-gray-400">Skipped</div>
        </div>
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-gray-400">{other}</div>
          <div className="text-sm text-gray-400">Other</div>
        </div>
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-purple-400">{avgCompletionDisplay}%</div>
          <div className="text-sm text-gray-400">Avg Completion</div>
        </div>
      </div>

      {/* Skip Reasons - Charts disabled */}
      {skipReasons.length > 0 && (
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
          <h3 className="text-xl text-white mb-4">Skip Reasons</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {skipReasons.map((r, idx) => (
              <div key={idx} className="bg-gray-700 p-3 rounded text-center">
                <div className="text-xl font-bold text-red-400">{parseInt(r.count) || 0}</div>
                <div className="text-sm text-gray-400">{r.skip_reason || 'Unknown'}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Most Skipped Tracks */}
      {mostSkipped.length > 0 && (
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
          <h3 className="text-xl text-white mb-4">Most Skipped Tracks</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-gray-400 border-b border-gray-700">
                  <th className="pb-2 px-4">Track</th>
                  <th className="pb-2 px-4">Skip Count</th>
                  <th className="pb-2 px-4">Avg Skip Position</th>
                </tr>
              </thead>
              <tbody>
                {mostSkipped.map((track, idx) => (
                  <tr key={idx} className="border-b border-gray-700/50 text-gray-300">
                    <td className="py-2 px-4">{track.track_title || 'Unknown'}</td>
                    <td className="py-2 px-4">{track.skip_count || '0'}</td>
                    <td className="py-2 px-4">{track.avg_skip_position ? `${track.avg_skip_position}s` : 'N/A'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Most Completed Tracks */}
      {mostCompleted.length > 0 && (
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
          <h3 className="text-xl text-white mb-4">Most Completed Tracks</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-gray-400 border-b border-gray-700">
                  <th className="pb-2 px-4">Track</th>
                  <th className="pb-2 px-4">Completion Count</th>
                </tr>
              </thead>
              <tbody>
                {mostCompleted.map((track, idx) => (
                  <tr key={idx} className="border-b border-gray-700/50 text-gray-300">
                    <td className="py-2 px-4">{track.track_title || 'Unknown'}</td>
                    <td className="py-2 px-4">{track.completion_count || '0'}</td>
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
