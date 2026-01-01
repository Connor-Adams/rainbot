import { Bar, Doughnut } from 'react-chartjs-2'
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, ArcElement, Title, Tooltip, Legend } from 'chart.js'
import type { CommandStat } from '@/types'
import { escapeHtml } from '@/lib/utils'
import { StatsLoading, StatsError, StatsSection, StatsTable } from '@/components/common'
import { useStatsQuery } from '@/hooks/useStatsQuery'
import { statsApi } from '@/lib/api'
import { safeInt, safeString } from '@/lib/chartSafety'

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Title, Tooltip, Legend)

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

  const totalCount = safeInt(data.total)
  const successCount = commands.reduce((sum: number, c: CommandStat) => sum + safeInt(c.success_count), 0)
  const errorCount = Math.max(0, totalCount - successCount)

  // Prepare safe chart data
  const top10 = commands.slice(0, 10)
  const barLabels = top10.map((c: CommandStat) => safeString(c.command_name, 'Unknown'))
  const barValues = top10.map((c: CommandStat) => safeInt(c.count))
  const canRenderBar = barLabels.length > 0 && barValues.every(Number.isFinite)

  const barData = {
    labels: barLabels,
    datasets: [{
      label: 'Usage Count',
      data: barValues,
      backgroundColor: 'rgba(59, 130, 246, 0.5)',
      borderColor: 'rgba(59, 130, 246, 1)',
      borderWidth: 1,
    }],
  }

  const doughnutData = {
    labels: ['Success', 'Errors'],
    datasets: [{
      data: [successCount, errorCount],
      backgroundColor: ['rgba(34, 197, 94, 0.5)', 'rgba(239, 68, 68, 0.5)'],
      borderColor: ['rgba(34, 197, 94, 1)', 'rgba(239, 68, 68, 1)'],
      borderWidth: 1,
    }],
  }

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
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
            <h3 className="text-lg text-white mb-4">Top Commands</h3>
            <div className="max-h-[300px]">
              <Bar data={barData} options={{ responsive: true, maintainAspectRatio: true, scales: { y: { beginAtZero: true } } }} />
            </div>
          </div>
        )}
        {(successCount > 0 || errorCount > 0) && (
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
            <h3 className="text-lg text-white mb-4">Success Rate</h3>
            <div className="max-h-[300px]">
              <Doughnut data={doughnutData} options={{ responsive: true, maintainAspectRatio: true }} />
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

