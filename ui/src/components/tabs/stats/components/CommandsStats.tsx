import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import type { CommandStat } from '@/types'
import { escapeHtml } from '@/lib/utils'
import { StatsLoading, StatsError, StatsSection, StatsTable } from '@/components/common'
import { useStatsQuery } from '@/hooks/useStatsQuery'
import { statsApi } from '@/lib/api'
import { safeInt, safeString } from '@/lib/chartSafety'

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
        <small className="text-xs text-text-muted">Command statistics will appear as users interact with the bot</small>
      </div>
    )
  }

  const totalCount = safeInt(data.total)
  const successCount = commands.reduce((sum: number, c: CommandStat) => sum + safeInt(c.success_count), 0)
  const errorCount = Math.max(0, totalCount - successCount)

  // Prepare Recharts data
  const top10 = commands.slice(0, 10)
  const barChartData = top10.map((c: CommandStat) => ({
    command: safeString(c.command_name, 'Unknown'),
    count: safeInt(c.count),
  }))
  const canRenderBar = barChartData.length > 0

  const pieChartData = [
    { name: 'Success', value: successCount, color: '#22c55e' },
    { name: 'Errors', value: errorCount, color: '#ef4444' },
  ]

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
      {/* Charts */}
      <div className="grid md:grid-cols-2 gap-6">
        {canRenderBar && (
          <div className="bg-surface border border-border rounded-xl p-6">
            <h3 className="text-lg text-text-primary mb-4">Top Commands</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={barChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#252530" />
                <XAxis dataKey="command" stroke="#a1a1b0" angle={-45} textAnchor="end" height={80} />
                <YAxis stroke="#a1a1b0" />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#181820', border: '1px solid #252530', borderRadius: '8px' }}
                  labelStyle={{ color: '#ffffff' }}
                />
                <Bar dataKey="count" fill="#3b82f6" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
        {(successCount > 0 || errorCount > 0) && (
          <div className="bg-surface border border-border rounded-xl p-6">
            <h3 className="text-lg text-text-primary mb-4">Success Rate</h3>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={pieChartData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {pieChartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ backgroundColor: '#181820', border: '1px solid #252530', borderRadius: '8px' }}
                />
              </PieChart>
            </ResponsiveContainer>
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

