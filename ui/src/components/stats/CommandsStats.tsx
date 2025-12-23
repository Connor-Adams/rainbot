import { useQuery } from '@tanstack/react-query'
import { statsApi } from '@/lib/api'
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

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Title, Tooltip, Legend)

export default function CommandsStats() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['stats', 'commands'],
    queryFn: () => statsApi.commands().then((res) => res.data),
    refetchInterval: 30000,
  })

  if (isLoading) {
    return <div className="stats-loading text-center py-12 text-gray-400">Loading command statistics...</div>
  }

  if (error) {
    return (
      <div className="stats-error text-center py-12 text-red-400">
        Error: {error instanceof Error ? error.message : 'Unknown error'}
      </div>
    )
  }

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

  return (
    <>
      <div className="stats-section bg-gray-800 border border-gray-700 rounded-xl p-6 mb-6">
        <h3 className="text-xl text-white mb-4">Top Commands</h3>
        <div className="max-h-[400px]">
          <Bar data={barData} options={{ responsive: true, scales: { y: { beginAtZero: true } } }} />
        </div>
      </div>
      <div className="stats-section bg-gray-800 border border-gray-700 rounded-xl p-6 mb-6">
        <h3 className="text-xl text-white mb-4">Command Success Rate</h3>
        <div className="max-h-[400px]">
          <Doughnut data={doughnutData} options={{ responsive: true }} />
        </div>
      </div>
      <div className="stats-table-section bg-gray-800 border border-gray-700 rounded-xl p-6">
        <h3 className="text-xl text-white mb-4">Command Details</h3>
        <table className="stats-table w-full">
          <thead>
            <tr>
              <th>Command</th>
              <th>Count</th>
              <th>Success</th>
              <th>Errors</th>
              <th>Success Rate</th>
            </tr>
          </thead>
          <tbody>
            {(data.commands || []).map((cmd: CommandStat) => {
              const successCount = parseInt(cmd.success_count || '0')
              const errorCount = parseInt(cmd.error_count || '0')
              const total = successCount + errorCount
              const successRate = total > 0 ? ((successCount / total) * 100).toFixed(1) : '0'
              return (
                <tr key={cmd.command_name} className="hover:bg-gray-700/50 transition-colors">
                  <td className="px-4 py-3 text-sm text-white">{escapeHtml(cmd.command_name)}</td>
                  <td className="px-4 py-3 text-sm text-gray-400 font-mono">
                    {parseInt(cmd.count).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-400 font-mono">
                    {successCount.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-400 font-mono">
                    {errorCount.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-400 font-mono">{successRate}%</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </>
  )
}

