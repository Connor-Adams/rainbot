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
import { StatsLoading, StatsError, ChartContainer } from '@/components/common'
import { useStatsQuery } from '@/hooks/useStatsQuery'
import { statsApi } from '@/lib/api'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend)

export default function TimeStats() {
  const { data, isLoading, error } = useStatsQuery({
    queryKey: ['stats', 'time'],
    queryFn: () => statsApi.time({ granularity: 'day' }),
  })

  if (isLoading) return <StatsLoading message="Loading time trends..." />
  if (error) return <StatsError error={error} />
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
    <ChartContainer title="Usage Over Time">
      <Line data={lineData} options={{ responsive: true, scales: { y: { beginAtZero: true } } }} />
    </ChartContainer>
  )
}

