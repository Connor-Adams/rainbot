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

interface EventType {
  event_type: string
  count: string
}

interface TopTarget {
  event_type: string
  event_target: string
  count: string
}

interface ActiveUser {
  user_id: string
  event_count: string
  unique_event_types: string
  last_activity: string
}

interface WebAnalyticsData {
  eventTypes: EventType[]
  topTargets: TopTarget[]
  activeUsers: ActiveUser[]
}

export default function WebAnalyticsStats() {
  const { data, isLoading, error } = useQuery<WebAnalyticsData>({
    queryKey: ['stats', 'web-analytics'],
    queryFn: () => statsApi.webAnalytics().then((r) => r.data),
    refetchInterval: 10000,
  })

  if (isLoading) return <div className="stats-loading text-center py-12">Loading web analytics...</div>
  if (error) return <div className="stats-error text-center py-12">Error loading web analytics</div>
  if (!data) return null

  const eventTypesData = {
    labels: (data.eventTypes || []).map((e) => e.event_type),
    datasets: [
      {
        data: (data.eventTypes || []).map((e) => parseInt(e.count)),
        backgroundColor: [
          'rgba(59, 130, 246, 0.7)',
          'rgba(34, 197, 94, 0.7)',
          'rgba(251, 146, 60, 0.7)',
          'rgba(168, 85, 247, 0.7)',
          'rgba(236, 72, 153, 0.7)',
        ],
        borderColor: [
          'rgba(59, 130, 246, 1)',
          'rgba(34, 197, 94, 1)',
          'rgba(251, 146, 60, 1)',
          'rgba(168, 85, 247, 1)',
          'rgba(236, 72, 153, 1)',
        ],
        borderWidth: 1,
      },
    ],
  }

  const topTargetsData = {
    labels: (data.topTargets || []).slice(0, 10).map((t) => `${t.event_type}: ${t.event_target}`.substring(0, 30)),
    datasets: [
      {
        label: 'Events',
        data: (data.topTargets || []).slice(0, 10).map((t) => parseInt(t.count)),
        backgroundColor: 'rgba(59, 130, 246, 0.6)',
        borderColor: 'rgba(59, 130, 246, 1)',
        borderWidth: 1,
      },
    ],
  }

  return (
    <div className="space-y-6">
      {/* Event Types Distribution */}
      <div className="bg-surface border border-border rounded-xl p-6">
        <h3 className="text-xl text-text-primary mb-4">Event Types Distribution</h3>
        <div className="max-h-[400px]">
          <Doughnut
            data={eventTypesData}
            options={{
              responsive: true,
              plugins: {
                legend: { labels: { color: '#9ca3af' } },
              },
            }}
          />
        </div>
      </div>

      {/* Top Event Targets */}
      {data.topTargets.length > 0 && (
        <div className="bg-surface border border-border rounded-xl p-6">
          <h3 className="text-xl text-text-primary mb-4">Top Event Targets (Pages/Buttons)</h3>
          <div className="max-h-[400px]">
            <Bar
              data={topTargetsData}
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

      {/* Active Web Users */}
      {data.activeUsers.length > 0 && (
        <div className="bg-surface border border-border rounded-xl p-6">
          <h3 className="text-xl text-text-primary mb-4">Most Active Web Users</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-text-secondary border-b border-border">
                  <th className="pb-2 px-4">User ID</th>
                  <th className="pb-2 px-4">Events</th>
                  <th className="pb-2 px-4">Event Types</th>
                  <th className="pb-2 px-4">Last Activity</th>
                </tr>
              </thead>
              <tbody>
                {data.activeUsers.slice(0, 10).map((user) => (
                  <tr key={user.user_id} className="border-b border-border/50 text-text-secondary">
                    <td className="py-2 px-4 font-mono text-sm">{user.user_id}</td>
                    <td className="py-2 px-4">{user.event_count}</td>
                    <td className="py-2 px-4">{user.unique_event_types}</td>
                    <td className="py-2 px-4 text-sm">
                      {new Date(user.last_activity).toLocaleString()}
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
