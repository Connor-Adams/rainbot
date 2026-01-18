import { useQuery } from '@tanstack/react-query'
import { statsApi } from '@/lib/api'
import { EmptyState } from '@/components/common'
import { safeInt } from '@/lib/chartSafety'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts'

interface EngagementSummary {
  total_tracks: string
  completed: string
  skipped: string
  avg_played_seconds: string
  avg_completion_percent: string
}

interface SkipReason {
  skip_reason: string
  count: string
}

interface EngagementData {
  summary: EngagementSummary
  skipReasons: SkipReason[]
  mostSkipped: unknown[]
  mostCompleted: unknown[]
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

  const summary: EngagementSummary = data.summary || {
    total_tracks: '0', completed: '0', skipped: '0', avg_played_seconds: '0', avg_completion_percent: '0',
  }
  const completed = safeInt(summary.completed)
  const skipped = safeInt(summary.skipped)
  const totalTracks = safeInt(summary.total_tracks)
  const avgCompletionPercent = parseFloat(summary.avg_completion_percent || '0')
  const avgCompletionDisplay = isNaN(avgCompletionPercent) ? '0.0' : avgCompletionPercent.toFixed(1)
  const skipReasons = Array.isArray(data.skipReasons) ? data.skipReasons : []

  if (totalTracks === 0) {
    return <EmptyState icon="📈" message="No track engagement data available" submessage="Engagement statistics will appear here once tracks are played" />
  }

  const other = Math.max(0, totalTracks - completed - skipped)
  const completionData = [
    { name: 'Completed', value: completed, color: 'rgb(34, 197, 94)' },
    { name: 'Skipped', value: skipped, color: 'rgb(239, 68, 68)' },
    { name: 'Other', value: other, color: 'rgb(156, 163, 175)' },
  ].filter(d => d.value > 0)

  const skipColors = ['rgb(239, 68, 68)', 'rgb(251, 146, 60)', 'rgb(251, 191, 36)']
  const skipData = skipReasons.map((r, idx) => ({
    name: r.skip_reason || 'Unknown',
    value: safeInt(r.count),
    color: skipColors[idx % 3],
  }))

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-surface border border-border rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-primary-light">{totalTracks}</div>
          <div className="text-sm text-text-secondary">Total Tracks</div>
        </div>
        <div className="bg-surface border border-border rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-success-light">{completed}</div>
          <div className="text-sm text-text-secondary">Completed</div>
        </div>
        <div className="bg-surface border border-border rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-danger-light">{skipped}</div>
          <div className="text-sm text-text-secondary">Skipped</div>
        </div>
        <div className="bg-surface border border-border rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-text-secondary">{other}</div>
          <div className="text-sm text-text-secondary">Other</div>
        </div>
        <div className="bg-surface border border-border rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-secondary-light">{avgCompletionDisplay}%</div>
          <div className="text-sm text-text-secondary">Avg Completion</div>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {completionData.length > 0 && (
          <div className="bg-surface border border-border rounded-xl p-6">
            <h3 className="text-lg text-text-primary mb-4">Completion vs Skips</h3>
            <div style={{ width: '100%', height: 280 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={completionData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={2}
                    label={({ name, percent }: { name: string; percent: number }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                    labelLine={{ stroke: '#6b7280' }}
                  >
                    {completionData.map((entry, index) => (
                      <Cell key={index} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: 8 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
        
        {skipData.length > 0 && (
          <div className="bg-surface border border-border rounded-xl p-6">
            <h3 className="text-lg text-text-primary mb-4">Skip Reasons</h3>
            <div style={{ width: '100%', height: Math.max(200, skipData.length * 32) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={skipData} layout="vertical" margin={{ left: 80, right: 20 }}>
                  <XAxis type="number" tick={{ fill: '#9ca3af', fontSize: 12 }} />
                  <YAxis type="category" dataKey="name" tick={{ fill: '#9ca3af', fontSize: 12 }} width={75} />
                  <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: 8 }} />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                    {skipData.map((entry, index) => (
                      <Cell key={index} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
