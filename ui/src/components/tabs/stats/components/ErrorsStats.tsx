import { useQuery } from '@tanstack/react-query'
import { statsApi } from '@/lib/api'
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

interface ErrorSummary {
  total_errors: string
  unique_commands: string
  most_common_error: string | null
  most_failing_command: string | null
}

interface ErrorByType {
  error_type: string
  count: string
}

interface ErrorByCommand {
  command_name: string
  error_count: string
  success_count: string
  error_rate: string
}

interface RecentError {
  command_name: string
  error_type: string
  error_message: string
  created_at: string
}

interface ErrorsData {
  summary: ErrorSummary
  byType: ErrorByType[]
  byCommand: ErrorByCommand[]
  recent: RecentError[]
}

export default function ErrorsStats() {
  const { data, isLoading, error } = useQuery<ErrorsData>({
    queryKey: ['stats', 'errors'],
    queryFn: () => statsApi.errors().then((r) => r.data),
    refetchInterval: 30000,
  })

  if (isLoading) return <div className="stats-loading text-center py-12">Loading errors...</div>
  if (error) return <div className="stats-error text-center py-12">Error loading errors</div>

  const summary = data?.summary || { total_errors: '0', unique_commands: '0', most_common_error: null, most_failing_command: null }
  const byType = Array.isArray(data?.byType) ? data.byType : []
  const byCommand = Array.isArray(data?.byCommand) ? data.byCommand : []
  const recent = Array.isArray(data?.recent) ? data.recent : []

  if (!data || safeInt(summary.total_errors) === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-8 px-6 text-center">
        <span className="text-3xl opacity-50">✅</span>
        <p className="text-sm text-text-secondary">No errors recorded</p>
        <small className="text-xs text-text-muted">Error statistics will appear here if commands fail</small>
      </div>
    )
  }

  const typeColors = ['rgb(239, 68, 68)', 'rgb(251, 146, 60)', 'rgb(251, 191, 36)', 'rgb(168, 85, 247)']
  const typeData = byType.map((t, idx) => ({
    name: t.error_type || 'Unknown',
    value: safeInt(t.count),
    color: typeColors[idx % 4],
  })).filter(d => d.value > 0)

  const commandData = byCommand.slice(0, 10).map((c) => ({
    name: c.command_name || 'Unknown',
    value: safeInt(c.error_count),
  }))

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-surface border border-border rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-danger-light">{summary.total_errors || 0}</div>
          <div className="text-sm text-text-secondary">Total Errors</div>
        </div>
        <div className="bg-surface border border-border rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-warning">{summary.unique_commands || 0}</div>
          <div className="text-sm text-text-secondary">Unique Commands</div>
        </div>
        <div className="bg-surface border border-border rounded-xl p-4 text-center">
          <div className="text-sm font-bold text-warning-light truncate">{summary.most_common_error || 'N/A'}</div>
          <div className="text-sm text-text-secondary">Most Common Error</div>
        </div>
        <div className="bg-surface border border-border rounded-xl p-4 text-center">
          <div className="text-sm font-bold text-secondary-light truncate">{summary.most_failing_command || 'N/A'}</div>
          <div className="text-sm text-text-secondary">Most Failing Command</div>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {typeData.length > 0 && (
          <div className="bg-surface border border-border rounded-xl p-6">
            <h3 className="text-lg text-text-primary mb-4">Errors by Type</h3>
            <div style={{ width: '100%', height: 280 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={typeData}
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
                    {typeData.map((entry, index) => (
                      <Cell key={index} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: 8 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
        
        {commandData.length > 0 && (
          <div className="bg-surface border border-border rounded-xl p-6">
            <h3 className="text-lg text-text-primary mb-4">Errors by Command</h3>
            <div style={{ width: '100%', height: Math.max(200, commandData.length * 32) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={commandData} layout="vertical" margin={{ left: 80, right: 20 }}>
                  <XAxis type="number" tick={{ fill: '#9ca3af', fontSize: 12 }} />
                  <YAxis type="category" dataKey="name" tick={{ fill: '#9ca3af', fontSize: 12 }} width={75} />
                  <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: 8 }} />
                  <Bar dataKey="value" fill="rgb(239, 68, 68)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>

      {recent.length > 0 && (
        <div className="bg-surface border border-border rounded-xl p-6">
          <h3 className="text-xl text-text-primary mb-4">Recent Errors</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-text-secondary border-b border-border">
                  <th className="pb-2 px-4">Command</th>
                  <th className="pb-2 px-4">Error Type</th>
                  <th className="pb-2 px-4">Message</th>
                </tr>
              </thead>
              <tbody>
                {recent.slice(0, 10).map((err, idx) => (
                  <tr key={idx} className="border-b border-border/50 text-text-secondary">
                    <td className="py-2 px-4">{err.command_name}</td>
                    <td className="py-2 px-4"><span className="px-2 py-1 bg-danger/10 text-danger-light rounded text-xs">{err.error_type}</span></td>
                    <td className="py-2 px-4 text-sm truncate max-w-xs">{err.error_message}</td>
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
