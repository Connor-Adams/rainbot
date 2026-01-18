import type { CommandStat } from '@/types'
import { escapeHtml } from '@/lib/utils'
import { StatsLoading, StatsError, StatsSection, StatsTable } from '@/components/common'
import { useStatsQuery } from '@/hooks/useStatsQuery'
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

export default function CommandsStats() {
  const { data, isLoading, error } = useStatsQuery({
    queryKey: ['stats', 'commands'],
    queryFn: () => statsApi.commands(),
  })

  if (isLoading) return <StatsLoading message="Loading command statistics..." />
  if (error) return <StatsError error={error} />
  
  // Safe data access with defaults
  const commands = Array.isArray(data?.commands) ? data.commands : []
  
  if (!data || commands.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-8 px-6 text-center">
        <span className="text-3xl opacity-50">📊</span>
        <p className="text-sm text-text-secondary">No command data available yet</p>
        <small className="text-xs text-text-muted">
          Command statistics will appear as users interact with the bot
        </small>
      </div>
    )
  }

  const totalCount = safeInt(data.total)
  const successCount = commands.reduce((sum: number, c: CommandStat) => sum + safeInt(c.success_count), 0)
  const errorCount = Math.max(0, totalCount - successCount)

  const barChartData = commands.slice(0, 10).map((c: CommandStat) => ({
    name: c.command_name || 'Unknown',
    value: safeInt(c.count),
  }))

  const doughnutData = [
    { name: 'Success', value: successCount, color: 'rgb(34, 197, 94)' },
    { name: 'Errors', value: errorCount, color: 'rgb(239, 68, 68)' },
  ].filter(d => d.value > 0)

  const columns = [
    {
      id: 'command',
      header: 'Command',
      render: (cmd: CommandStat) => escapeHtml(cmd.command_name),
      className: 'px-4 py-3 text-sm text-text-primary',
    },
    {
      id: 'count',
      header: 'Count',
      render: (cmd: CommandStat) => (
        <span className="font-mono">{safeInt(cmd.count).toLocaleString()}</span>
      ),
      className: 'px-4 py-3 text-sm text-text-secondary',
    },
    {
      id: 'success',
      header: 'Success',
      render: (cmd: CommandStat) => (
        <span className="font-mono">{safeInt(cmd.success_count).toLocaleString()}</span>
      ),
      className: 'px-4 py-3 text-sm text-text-secondary',
    },
    {
      id: 'errors',
      header: 'Errors',
      render: (cmd: CommandStat) => (
        <span className="font-mono">{safeInt(cmd.error_count).toLocaleString()}</span>
      ),
      className: 'px-4 py-3 text-sm text-text-secondary',
    },
    {
      id: 'success_rate',
      header: 'Success Rate',
      render: (cmd: CommandStat) => {
        const sc = safeInt(cmd.success_count)
        const ec = safeInt(cmd.error_count)
        const total = sc + ec
        const rate = total > 0 ? ((sc / total) * 100).toFixed(1) : '0'
        return <span className="font-mono">{rate}%</span>
      },
      className: 'px-4 py-3 text-sm text-text-secondary',
    },
  ]

  return (
    <div className="space-y-6">
      <div className="grid md:grid-cols-2 gap-6">
        {barChartData.length > 0 && (
          <div className="bg-surface border border-border rounded-xl p-4 sm:p-6">
            <h3 className="text-lg text-text-primary mb-4">Top Commands</h3>
            <div style={{ width: '100%', height: Math.max(200, barChartData.length * 32) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barChartData} layout="vertical" margin={{ left: 80, right: 20 }}>
                  <XAxis type="number" tick={{ fill: '#9ca3af', fontSize: 12 }} />
                  <YAxis type="category" dataKey="name" tick={{ fill: '#9ca3af', fontSize: 12 }} width={75} />
                  <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: 8 }} />
                  <Bar dataKey="value" fill="rgb(59, 130, 246)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
        {doughnutData.length > 0 && (
          <div className="bg-surface border border-border rounded-xl p-4 sm:p-6">
            <h3 className="text-lg text-text-primary mb-4">Success Rate</h3>
            <div style={{ width: '100%', height: 280 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={doughnutData}
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
                    {doughnutData.map((entry, index) => (
                      <Cell key={index} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: 8 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>
      <StatsSection title="Command Details">
        <StatsTable
          columns={columns}
          data={commands}
          emptyMessage="No command data available"
          getRowKey={(cmd: CommandStat) => cmd.command_name}
        />
      </StatsSection>
    </div>
  )
}
