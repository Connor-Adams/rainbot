// CHARTS DISABLED FOR DEBUGGING
// import { Bar, Doughnut } from 'react-chartjs-2'
// import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, ArcElement, Title, Tooltip, Legend } from 'chart.js'
import type { CommandStat } from '@/types'
import { escapeHtml } from '@/lib/utils'
import { StatsLoading, StatsError, StatsSection, StatsTable } from '@/components/common'
import { useStatsQuery } from '@/hooks/useStatsQuery'
import { statsApi } from '@/lib/api'

// ChartJS.register(...)

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
        <p className="text-sm text-gray-400">No command data available yet</p>
        <small className="text-xs text-gray-500">Command statistics will appear as users interact with the bot</small>
      </div>
    )
  }

  const totalCount = typeof data.total === 'number' ? data.total : parseInt(data.total || '0') || 0
  const successCount = commands.reduce((sum: number, c: CommandStat) => sum + (parseInt(c.success_count || '0') || 0), 0)
  const errorCount = Math.max(0, totalCount - successCount)

  const columns = [
    {
      id: 'command',
      header: 'Command',
      render: (cmd: CommandStat) => escapeHtml(cmd.command_name),
      className: 'px-4 py-3 text-sm text-white',
    },
    {
      id: 'count',
      header: 'Count',
      render: (cmd: CommandStat) => (
        <span className="font-mono">{(parseInt(cmd.count) || 0).toLocaleString()}</span>
      ),
      className: 'px-4 py-3 text-sm text-gray-400',
    },
    {
      id: 'success',
      header: 'Success',
      render: (cmd: CommandStat) => (
        <span className="font-mono">{(parseInt(cmd.success_count || '0') || 0).toLocaleString()}</span>
      ),
      className: 'px-4 py-3 text-sm text-gray-400',
    },
    {
      id: 'errors',
      header: 'Errors',
      render: (cmd: CommandStat) => (
        <span className="font-mono">{(parseInt(cmd.error_count || '0') || 0).toLocaleString()}</span>
      ),
      className: 'px-4 py-3 text-sm text-gray-400',
    },
    {
      id: 'success_rate',
      header: 'Success Rate',
      render: (cmd: CommandStat) => {
        const sc = parseInt(cmd.success_count || '0') || 0
        const ec = parseInt(cmd.error_count || '0') || 0
        const total = sc + ec
        const rate = total > 0 ? ((sc / total) * 100).toFixed(1) : '0'
        return <span className="font-mono">{rate}%</span>
      },
      className: 'px-4 py-3 text-sm text-gray-400',
    },
  ]

  return (
    <div className="space-y-6">
      {/* Summary - Charts disabled for debugging */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-gray-700 rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-blue-400">{totalCount}</div>
          <div className="text-sm text-gray-400">Total Commands</div>
        </div>
        <div className="bg-gray-700 rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-green-400">{successCount}</div>
          <div className="text-sm text-gray-400">Successful</div>
        </div>
        <div className="bg-gray-700 rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-red-400">{errorCount}</div>
          <div className="text-sm text-gray-400">Errors</div>
        </div>
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

