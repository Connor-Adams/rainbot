import { useQuery } from '@tanstack/react-query'
import { statsApi } from '@/lib/api'
import { Line } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js'
import type { TimeDataPoint } from '@/types'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend)

export default function TimeStats() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['stats', 'time'],
    queryFn: () => statsApi.time({ granularity: 'day' }).then((res) => res.data),
    refetchInterval: 30000,
  })

  if (isLoading) {
    return <div className="stats-loading text-center py-12 text-gray-400">Loading time trends...</div>
  }

  if (error) {
    return (
      <div className="stats-error text-center py-12 text-red-400">
        Error: {error instanceof Error ? error.message : 'Unknown error'}
      </div>
    )
  }

  if (!data) return null

  const dates = [
    ...new Set([
      ...(data.commands || []).map((c: TimeDataPoint) => c.date),
      ...(data.sounds || []).map((s: TimeDataPoint) => s.date),
    ]),
  ].sort()

  const commandData = dates.map((date) => {
    const cmd = (data.commands || []).find((c: TimeDataPoint) => c.date === date)
    return cmd ? parseInt(cmd.command_count || '0') : 0
  })

  const soundData = dates.map((date) => {
    const snd = (data.sounds || []).find((s: TimeDataPoint) => s.date === date)
    return snd ? parseInt(snd.sound_count || '0') : 0
  })

  const lineData = {
    labels: dates.map((d) => new Date(d).toLocaleDateString()),
    datasets: [
      {
        label: 'Commands',
        data: commandData,
        borderColor: 'rgba(59, 130, 246, 1)',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        tension: 0.4,
      },
      {
        label: 'Sounds',
        data: soundData,
        borderColor: 'rgba(139, 92, 246, 1)',
        backgroundColor: 'rgba(139, 92, 246, 0.1)',
        tension: 0.4,
      },
    ],
  }

  return (
    <div className="stats-section bg-gray-800 border border-gray-700 rounded-xl p-6">
      <h3 className="text-xl text-white mb-4">Usage Over Time</h3>
      <div className="max-h-[400px]">
        <Line data={lineData} options={{ responsive: true, scales: { y: { beginAtZero: true } } }} />
      </div>
    </div>
  )
}

