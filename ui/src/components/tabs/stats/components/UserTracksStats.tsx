import { useQuery } from '@tanstack/react-query'
import { statsApi } from '@/lib/api'
// CHARTS DISABLED FOR DEBUGGING

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

  return (
    <div className="space-y-6">
      {/* Source Types Distribution - Charts disabled */}
      {sourceTypes.length > 0 && (
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
          <h3 className="text-xl text-white mb-4">Track Sources (Charts disabled for debugging)</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {sourceTypes.map((s, idx) => (
              <div key={idx} className="bg-gray-700 p-3 rounded text-center">
                <div className="text-xl font-bold text-purple-400">{parseInt(s.count) || 0}</div>
                <div className="text-sm text-gray-400">{s.source_type || 'Unknown'}</div>
              </div>
            ))}
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
