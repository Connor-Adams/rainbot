import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import type { TimeDataPoint } from '@/types'
import { StatsLoading, StatsError } from '@/components/common'
import { useStatsQuery } from '@/hooks/useStatsQuery'
import { statsApi } from '@/lib/api'
import { safeInt, safeDateLabel } from '@/lib/chartSafety'

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
        <p className="text-sm text-text-secondary">No time trend data available yet</p>
        <small className="text-xs text-text-muted">Trend data will appear as users interact with the bot</small>
      </div>
    )
  }

  // Build combined date list and limit to last 30 days
  const commandDates = commands.filter((c: TimeDataPoint) => c?.date).map((c: TimeDataPoint) => c.date)
  const soundDates = sounds.filter((s: TimeDataPoint) => s?.date).map((s: TimeDataPoint) => s.date)
  const allDates = [...new Set([...commandDates, ...soundDates])].sort().slice(-30)

  // Prepare Recharts data format
  const chartData = allDates.map((date) => {
    const cmd = commands.find((c: TimeDataPoint) => c.date === date)
    const snd = sounds.find((s: TimeDataPoint) => s.date === date)
    return {
      date: safeDateLabel(date),
      Commands: cmd ? safeInt(cmd.command_count) : 0,
      Sounds: snd ? safeInt(snd.sound_count) : 0,
    }
  })

  const canRender = chartData.length > 0

  return (
    <div className="bg-surface border border-border rounded-xl p-6">
      <h3 className="text-xl text-text-primary mb-4">Usage Over Time</h3>
      {canRender ? (
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#252530" />
            <XAxis dataKey="date" stroke="#a1a1b0" />
            <YAxis stroke="#a1a1b0" />
            <Tooltip 
              contentStyle={{ backgroundColor: '#181820', border: '1px solid #252530', borderRadius: '8px' }}
              labelStyle={{ color: '#ffffff' }}
            />
            <Legend wrapperStyle={{ color: '#a1a1b0' }} />
            <Line type="monotone" dataKey="Commands" stroke="#3b82f6" strokeWidth={2} dot={{ fill: '#3b82f6' }} />
            <Line type="monotone" dataKey="Sounds" stroke="#8b5cf6" strokeWidth={2} dot={{ fill: '#8b5cf6' }} />
          </LineChart>
        </ResponsiveContainer>
      ) : (
        <p className="text-text-secondary">Not enough data to display chart</p>
      )}
    </div>
  )
}

