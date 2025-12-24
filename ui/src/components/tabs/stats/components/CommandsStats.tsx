import { Bar, Doughnut } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js'
import type { CommandStat } from '@/types'
import { escapeHtml } from '@/lib/utils'
import { StatsLoading, StatsError, ChartContainer, StatsSection, StatsTable } from '@/components/common'
import { useStatsQuery } from '@/hooks/useStatsQuery'
import { statsApi } from '@/lib/api'

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Title, Tooltip, Legend)

export default function CommandsStats() {
  const { data, isLoading, error } = useStatsQuery({
    queryKey: ['stats', 'commands'],
    queryFn: () => statsApi.commands(),
  })

  if (isLoading) return <StatsLoading message="Loading command statistics..." />
  if (error) return <StatsError error={error} />
  if (!data) return null

  const top10 = (data.commands || []).slice(0, 10)
  const successCount = data.total - (data.total - (data.commands || []).reduce((sum: number, c: CommandStat) => sum + parseInt(c.success_count || '0'), 0))
  const errorCount = data.total - successCount

  const barData = {
    labels: top10.map((c: CommandStat) => c.command_name),
    datasets: [
      {
        label: 'Usage Count',
        data: top10.map((c: CommandStat) => parseInt(c.count)),
        backgroundColor: 'rgba(59, 130, 246, 0.5)',
        borderColor: 'rgba(59, 130, 246, 1)',
        borderWidth: 1,
      },
    ],
  }

  const doughnutData = {
    labels: ['Success', 'Errors'],
    datasets: [
      {
        data: [successCount, errorCount],
        backgroundColor: ['rgba(34, 197, 94, 0.5)', 'rgba(239, 68, 68, 0.5)'],
        borderColor: ['rgba(34, 197, 94, 1)', 'rgba(239, 68, 68, 1)'],
        borderWidth: 1,
      },
    ],
  }

  const columns = [
    {
      header: 'Command',
      render: (cmd: CommandStat) => escapeHtml(cmd.command_name),
      className: 'px-4 py-3 text-sm text-white',
    },
    {
      header: 'Count',
      render: (cmd: CommandStat) => (
        <span className="font-mono">{parseInt(cmd.count).toLocaleString()}</span>
      ),
      className: 'px-4 py-3 text-sm text-gray-400',
    },
    {
      header: 'Success',
      render: (cmd: CommandStat) => (
        <span className="font-mono">{parseInt(cmd.success_count || '0').toLocaleString()}</span>
      ),
      className: 'px-4 py-3 text-sm text-gray-400',
    },
    {
      header: 'Errors',
      render: (cmd: CommandStat) => (
        <span className="font-mono">{parseInt(cmd.error_count || '0').toLocaleString()}</span>
      ),
      className: 'px-4 py-3 text-sm text-gray-400',
    },
    {
      header: 'Success Rate',
      render: (cmd: CommandStat) => {
        const successCount = parseInt(cmd.success_count || '0')
        const errorCount = parseInt(cmd.error_count || '0')
        const total = successCount + errorCount
        const successRate = total > 0 ? ((successCount / total) * 100).toFixed(1) : '0'
        return <span className="font-mono">{successRate}%</span>
      },
      className: 'px-4 py-3 text-sm text-gray-400',
    },
  ]

  return (
    <>
      <ChartContainer title="Top Commands">
        <Bar data={barData} options={{ responsive: true, scales: { y: { beginAtZero: true } } }} />
      </ChartContainer>
      <ChartContainer title="Command Success Rate">
        <Doughnut data={doughnutData} options={{ responsive: true }} />
      </ChartContainer>
      <StatsSection title="Command Details">
        <StatsTable
          columns={columns}
          data={data.commands || []}
          emptyMessage="No command data available"
        />
      </StatsSection>
    </>
  )
}

