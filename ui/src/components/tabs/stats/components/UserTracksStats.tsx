import { useQuery } from '@tanstack/react-query'
import { statsApi } from '@/lib/api'
import { Bar, Doughnut } from 'react-chartjs-2'
import '@/lib/chartSetup' // Centralized Chart.js registration
import { safeInt, safeString } from '@/lib/chartSafety'

interface TopTrack {
  track_title: string
  track_url: string
  source_type: string
  listen_count: string
  unique_listeners: string
}

interface RecentListen {
  user_id: string
  track_title: string
  track_url: string
  source_type: string
  listened_at: string
  queued_by: string
}

interface SourceType {
  source_type: string
  count: string
}

interface UserTracksData {
  topTracks: TopTrack[]
  recentListens: RecentListen[]
  sourceTypes: SourceType[]
}

export default function UserTracksStats() {
  const { data, isLoading, error } = useQuery<UserTracksData>({
    queryKey: ['stats', 'user-tracks'],
    queryFn: () => statsApi.userTracks().then((r) => r.data),
    refetchInterval: 10000,
  })

  if (isLoading) return <div className="stats-loading text-center py-12">Loading user tracks...</div>
  if (error) return <div className="stats-error text-center py-12">Error loading user tracks</div>
  
  // Safe data access with defaults
  const topTracks = Array.isArray(data?.topTracks) ? data.topTracks : []
  const recentListens = Array.isArray(data?.recentListens) ? data.recentListens : []
  const sourceTypes = Array.isArray(data?.sourceTypes) ? data.sourceTypes : []
  
  if (!data || (topTracks.length === 0 && recentListens.length === 0)) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-8 px-6 text-center">
        <span className="text-3xl opacity-50">🎵</span>
        <p className="text-sm text-gray-400">No user track data available yet</p>
        <small className="text-xs text-gray-500">Track data will appear as users listen to music</small>
      </div>
    )
  }

  // Prepare safe chart data
  const topTracksLabels = topTracks.slice(0, 10).map((t) => safeString(t.track_title, 'Unknown').substring(0, 30))
  const topTracksValues = topTracks.slice(0, 10).map((t) => safeInt(t.listen_count))
  const canRenderTopTracks = topTracksLabels.length > 0 && topTracksValues.every(Number.isFinite)

  const topTracksData = {
    labels: topTracksLabels,
    datasets: [{
      label: 'Listen Count',
      data: topTracksValues,
      backgroundColor: 'rgba(168, 85, 247, 0.6)',
      borderColor: 'rgba(168, 85, 247, 1)',
      borderWidth: 1,
    }],
  }

  const sourceLabels = sourceTypes.map((s) => safeString(s.source_type, 'Unknown'))
  const sourceValues = sourceTypes.map((s) => safeInt(s.count))
  const canRenderSource = sourceLabels.length > 0 && sourceValues.every(Number.isFinite) && sourceValues.some(v => v > 0)

  const sourceTypesData = {
    labels: sourceLabels,
    datasets: [{
      data: sourceValues,
      backgroundColor: ['rgba(34, 197, 94, 0.7)', 'rgba(59, 130, 246, 0.7)', 'rgba(251, 146, 60, 0.7)', 'rgba(168, 85, 247, 0.7)', 'rgba(236, 72, 153, 0.7)'],
      borderColor: ['rgba(34, 197, 94, 1)', 'rgba(59, 130, 246, 1)', 'rgba(251, 146, 60, 1)', 'rgba(168, 85, 247, 1)', 'rgba(236, 72, 153, 1)'],
      borderWidth: 1,
    }],
  }

  return (
    <div className="space-y-6">
      {/* Source Types Distribution */}
      {canRenderSource && (
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
          <h3 className="text-xl text-white mb-4">Track Sources</h3>
          <div className="max-h-[400px]">
            <Doughnut data={sourceTypesData} options={{ responsive: true, maintainAspectRatio: true, plugins: { legend: { labels: { color: '#9ca3af' } } } }} />
          </div>
        </div>
      )}

      {/* Top Tracks Chart */}
      {canRenderTopTracks && (
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
          <h3 className="text-xl text-white mb-4">Most Listened Tracks</h3>
          <div className="max-h-[400px]">
            <Bar data={topTracksData} options={{ responsive: true, maintainAspectRatio: true, indexAxis: 'y', scales: { x: { beginAtZero: true } }, plugins: { legend: { labels: { color: '#9ca3af' } } } }} />
          </div>
        </div>
      )}

      {/* Top Tracks Table */}
      {topTracks.length > 0 && (
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
          <h3 className="text-xl text-white mb-4">Top Tracks Details</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-gray-400 border-b border-gray-700">
                  <th className="pb-2 px-4">Track</th>
                  <th className="pb-2 px-4">Source</th>
                  <th className="pb-2 px-4">Listens</th>
                  <th className="pb-2 px-4">Unique Listeners</th>
                </tr>
              </thead>
              <tbody>
                {topTracks.map((track, idx) => (
                  <tr key={idx} className="border-b border-gray-700/50 text-gray-300">
                    <td className="py-2 px-4">
                      {track.track_url ? (
                        <a
                          href={track.track_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-400 hover:underline"
                        >
                          {track.track_title || 'Unknown'}
                        </a>
                      ) : (
                        track.track_title || 'Unknown'
                      )}
                    </td>
                    <td className="py-2 px-4">
                      <span className="px-2 py-1 rounded text-xs bg-gray-700">
                        {track.source_type || 'Unknown'}
                      </span>
                    </td>
                    <td className="py-2 px-4">{track.listen_count || '0'}</td>
                    <td className="py-2 px-4">{track.unique_listeners || '0'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Recent Listens */}
      {recentListens.length > 0 && (
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
          <h3 className="text-xl text-white mb-4">Recent Listens</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-gray-400 border-b border-gray-700">
                  <th className="pb-2 px-4">Track</th>
                  <th className="pb-2 px-4">Source</th>
                  <th className="pb-2 px-4">Queued By</th>
                  <th className="pb-2 px-4">Listened At</th>
                </tr>
              </thead>
              <tbody>
                {recentListens.slice(0, 15).map((listen, idx) => (
                  <tr key={idx} className="border-b border-gray-700/50 text-gray-300">
                    <td className="py-2 px-4">{listen.track_title || 'Unknown'}</td>
                    <td className="py-2 px-4">
                      <span className="px-2 py-1 rounded text-xs bg-gray-700">
                        {listen.source_type || 'Unknown'}
                      </span>
                    </td>
                    <td className="py-2 px-4 font-mono text-sm">{listen.queued_by || 'Unknown'}</td>
                    <td className="py-2 px-4 text-sm">
                      {listen.listened_at ? new Date(listen.listened_at).toLocaleString() : 'Unknown'}
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
