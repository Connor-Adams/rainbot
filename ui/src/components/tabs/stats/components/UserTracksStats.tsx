import { useQuery } from '@tanstack/react-query'
import { statsApi } from '@/lib/api'
import { Bar, Doughnut } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  ArcElement,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js'

ChartJS.register(ArcElement, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend)

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
  if (!data) return null

  const topTracksData = {
    labels: data.topTracks.slice(0, 10).map((t) => t.track_title.substring(0, 30)),
    datasets: [
      {
        label: 'Listen Count',
        data: data.topTracks.slice(0, 10).map((t) => parseInt(t.listen_count)),
        backgroundColor: 'rgba(168, 85, 247, 0.6)',
        borderColor: 'rgba(168, 85, 247, 1)',
        borderWidth: 1,
      },
    ],
  }

  const sourceTypesData = {
    labels: data.sourceTypes.map((s) => s.source_type || 'Unknown'),
    datasets: [
      {
        data: data.sourceTypes.map((s) => parseInt(s.count)),
        backgroundColor: [
          'rgba(34, 197, 94, 0.7)',
          'rgba(59, 130, 246, 0.7)',
          'rgba(251, 146, 60, 0.7)',
          'rgba(168, 85, 247, 0.7)',
          'rgba(236, 72, 153, 0.7)',
        ],
        borderColor: [
          'rgba(34, 197, 94, 1)',
          'rgba(59, 130, 246, 1)',
          'rgba(251, 146, 60, 1)',
          'rgba(168, 85, 247, 1)',
          'rgba(236, 72, 153, 1)',
        ],
        borderWidth: 1,
      },
    ],
  }

  return (
    <div className="space-y-6">
      {/* Source Types Distribution */}
      {data.sourceTypes.length > 0 && (
        <div className="bg-surface border border-border rounded-xl p-6">
          <h3 className="text-xl text-text-primary mb-4">Track Sources</h3>
          <div className="max-h-[400px]">
            <Doughnut
              data={sourceTypesData}
              options={{
                responsive: true,
                plugins: {
                  legend: { labels: { color: '#9ca3af' } },
                },
              }}
            />
          </div>
        </div>
      )}

      {/* Top Tracks Chart */}
      {data.topTracks.length > 0 && (
        <div className="bg-surface border border-border rounded-xl p-6">
          <h3 className="text-xl text-text-primary mb-4">Most Listened Tracks</h3>
          <div className="max-h-[400px]">
            <Bar
              data={topTracksData}
              options={{
                responsive: true,
                indexAxis: 'y',
                scales: { x: { beginAtZero: true } },
                plugins: { legend: { labels: { color: '#9ca3af' } } },
              }}
            />
          </div>
        </div>
      )}

      {/* Top Tracks Table */}
      {data.topTracks.length > 0 && (
        <div className="bg-surface border border-border rounded-xl p-6">
          <h3 className="text-xl text-text-primary mb-4">Top Tracks Details</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-text-secondary border-b border-border">
                  <th className="pb-2 px-4">Track</th>
                  <th className="pb-2 px-4">Source</th>
                  <th className="pb-2 px-4">Listens</th>
                  <th className="pb-2 px-4">Unique Listeners</th>
                </tr>
              </thead>
              <tbody>
                {data.topTracks.map((track, idx) => (
                  <tr key={idx} className="border-b border-border/50 text-text-secondary">
                    <td className="py-2 px-4">
                      {track.track_url ? (
                        <a
                          href={track.track_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-400 hover:underline"
                        >
                          {track.track_title}
                        </a>
                      ) : (
                        track.track_title
                      )}
                    </td>
                    <td className="py-2 px-4">
                      <span className="px-2 py-1 rounded text-xs bg-surface-elevated">
                        {track.source_type}
                      </span>
                    </td>
                    <td className="py-2 px-4">{track.listen_count}</td>
                    <td className="py-2 px-4">{track.unique_listeners}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Recent Listens */}
      {data.recentListens.length > 0 && (
        <div className="bg-surface border border-border rounded-xl p-6">
          <h3 className="text-xl text-text-primary mb-4">Recent Listens</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-text-secondary border-b border-border">
                  <th className="pb-2 px-4">Track</th>
                  <th className="pb-2 px-4">Source</th>
                  <th className="pb-2 px-4">Queued By</th>
                  <th className="pb-2 px-4">Listened At</th>
                </tr>
              </thead>
              <tbody>
                {data.recentListens.slice(0, 15).map((listen, idx) => (
                  <tr key={idx} className="border-b border-border/50 text-text-secondary">
                    <td className="py-2 px-4">{listen.track_title}</td>
                    <td className="py-2 px-4">
                      <span className="px-2 py-1 rounded text-xs bg-surface-elevated">
                        {listen.source_type}
                      </span>
                    </td>
                    <td className="py-2 px-4 font-mono text-sm">{listen.queued_by}</td>
                    <td className="py-2 px-4 text-sm">
                      {new Date(listen.listened_at).toLocaleString()}
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
