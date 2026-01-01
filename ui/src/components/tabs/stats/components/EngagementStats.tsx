import { useQuery } from '@tanstack/react-query'
import { statsApi } from '@/lib/api'
import { Doughnut, Bar } from 'react-chartjs-2'
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
  if (!data) return null

  const completed = parseInt(data.summary.completed || '0')
  const skipped = parseInt(data.summary.skipped || '0')
  const totalTracks = parseInt(data.summary.total_tracks || '0')
  const avgCompletionPercent = parseFloat(data.summary.avg_completion_percent || '0')
  const avgCompletionDisplay = isNaN(avgCompletionPercent) ? '0.0' : avgCompletionPercent.toFixed(1)

  const completionData = {
    labels: ['Completed', 'Skipped', 'Other'],
    datasets: [
      {
        data: [completed, skipped, Math.max(0, totalTracks - completed - skipped)],
        backgroundColor: [
          'rgba(34, 197, 94, 0.7)',
          'rgba(239, 68, 68, 0.7)',
          'rgba(156, 163, 175, 0.5)',
        ],
        borderColor: ['rgba(34, 197, 94, 1)', 'rgba(239, 68, 68, 1)', 'rgba(156, 163, 175, 1)'],
        borderWidth: 1,
      },
    ],
  }

  const skipReasonsData = {
    labels: data.skipReasons.map((r) => r.skip_reason || 'Unknown'),
    datasets: [
      {
        label: 'Skip Count',
        data: data.skipReasons.map((r) => parseInt(r.count)),
        backgroundColor: 'rgba(239, 68, 68, 0.6)',
        borderColor: 'rgba(239, 68, 68, 1)',
        borderWidth: 1,
      },
    ],
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
          <div className="text-2xl font-bold text-purple-400">{avgCompletionDisplay}%</div>
          <div className="text-sm text-gray-400">Avg Completion</div>
        </div>
      </div>

      {/* Completion vs Skips Chart */}
      <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
        <h3 className="text-xl text-white mb-4">Completion vs Skips</h3>
        <div className="max-h-[400px]">
          <Doughnut
            data={completionData}
            options={{
              responsive: true,
              plugins: {
                legend: { labels: { color: '#9ca3af' } },
              },
            }}
          />
        </div>
      </div>

      {/* Skip Reasons */}
      {data.skipReasons.length > 0 && (
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
          <h3 className="text-xl text-white mb-4">Skip Reasons</h3>
          <div className="max-h-[400px]">
            <Bar
              data={skipReasonsData}
              options={{
                responsive: true,
                scales: { y: { beginAtZero: true } },
                plugins: { legend: { labels: { color: '#9ca3af' } } },
              }}
            />
          </div>
        </div>
      )}

      {/* Most Skipped Tracks */}
      {data.mostSkipped.length > 0 && (
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
                {data.mostSkipped.map((track, idx) => (
                  <tr key={idx} className="border-b border-gray-700/50 text-gray-300">
                    <td className="py-2 px-4">{track.track_title}</td>
                    <td className="py-2 px-4">{track.skip_count}</td>
                    <td className="py-2 px-4">{track.avg_skip_position ? `${track.avg_skip_position}s` : 'N/A'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Most Completed Tracks */}
      {data.mostCompleted.length > 0 && (
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
                {data.mostCompleted.map((track, idx) => (
                  <tr key={idx} className="border-b border-gray-700/50 text-gray-300">
                    <td className="py-2 px-4">{track.track_title}</td>
                    <td className="py-2 px-4">{track.completion_count}</td>
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
