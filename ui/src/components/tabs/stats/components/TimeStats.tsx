import { Line } from 'react-chartjs-2'
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend } from 'chart.js'
import type { TimeDataPoint } from '@/types'
import { StatsLoading, StatsError } from '@/components/common'
import { useStatsQuery } from '@/hooks/useStatsQuery'
import { statsApi } from '@/lib/api'
import { safeInt, safeDateLabel } from '@/lib/chartSafety'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend)

export default function TimeStats() {
  const { data, isLoading, error } = useStatsQuery({
    queryKey: ['stats', 'time'],
    queryFn: () => statsApi.time({ granularity: 'day' }),
  })

  if (isLoading) return <StatsLoading message="Loading time trends..." />
  if (error) return <StatsError error={error} />
  
  // Safe data access with defaults
  const commands = Array.isArray(data?.commands) ? data.commands : []
  const sounds = Array.isArray(data?.sounds) ? data.sounds : []
  
  if (!data || (commands.length === 0 && sounds.length === 0)) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-8 px-6 text-center">
        <span className="text-3xl opacity-50">📈</span>
        <p className="text-sm text-gray-400">No time trend data available yet</p>
        <small className="text-xs text-gray-500">Trend data will appear as users interact with the bot</small>
      </div>
    )
  }

  // Build combined date list and limit to last 30 days
  const commandDates = commands.filter((c: TimeDataPoint) => c?.date).map((c: TimeDataPoint) => c.date)
  const soundDates = sounds.filter((s: TimeDataPoint) => s?.date).map((s: TimeDataPoint) => s.date)
  const allDates = [...new Set([...commandDates, ...soundDates])].sort().slice(-30)

  const commandData = allDates.map((date) => {
    const cmd = commands.find((c: TimeDataPoint) => c.date === date)
    return cmd ? safeInt(cmd.command_count) : 0
  })

  const soundData = allDates.map((date) => {
    const snd = sounds.find((s: TimeDataPoint) => s.date === date)
    return snd ? safeInt(snd.sound_count) : 0
  })

  const labels = allDates.map((d) => safeDateLabel(d))
  const canRender = labels.length > 0 && commandData.every(Number.isFinite) && soundData.every(Number.isFinite)

  const lineData = {
    labels,
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
    <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
      <h3 className="text-xl text-white mb-4">Usage Over Time</h3>
      {canRender ? (
        <div className="max-h-[400px]">
          <Line data={lineData} options={{ responsive: true, maintainAspectRatio: true, scales: { y: { beginAtZero: true } } }} />
        </div>
      ) : (
        <p className="text-gray-400">Not enough data to display chart</p>
      )}
    </div>
  )
}

