// CHARTS DISABLED FOR DEBUGGING
import type { TimeDataPoint } from '@/types'
import { StatsLoading, StatsError } from '@/components/common'
import { useStatsQuery } from '@/hooks/useStatsQuery'
import { statsApi } from '@/lib/api'

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

  // Get last 14 days for display
  const recentCommands = commands.slice(-14)
  const recentSounds = sounds.slice(-14)

  return (
    <div className="space-y-6">
      <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
        <h3 className="text-xl text-white mb-4">Usage Over Time (Charts disabled for debugging)</h3>
        <p className="text-gray-400 text-sm mb-4">Data points: {commands.length} commands, {sounds.length} sounds</p>
        
        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <h4 className="text-lg text-blue-400 mb-2">Commands by Day</h4>
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-gray-400 border-b border-gray-700">
                  <th className="pb-2">Date</th>
                  <th className="pb-2">Count</th>
                </tr>
              </thead>
              <tbody>
                {recentCommands.map((c: TimeDataPoint, idx: number) => (
                  <tr key={idx} className="border-b border-gray-700/50 text-gray-300">
                    <td className="py-1">{c.date ? new Date(c.date).toLocaleDateString() : 'Unknown'}</td>
                    <td className="py-1">{parseInt(c.command_count || '0') || 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div>
            <h4 className="text-lg text-purple-400 mb-2">Sounds by Day</h4>
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-gray-400 border-b border-gray-700">
                  <th className="pb-2">Date</th>
                  <th className="pb-2">Count</th>
                </tr>
              </thead>
              <tbody>
                {recentSounds.map((s: TimeDataPoint, idx: number) => (
                  <tr key={idx} className="border-b border-gray-700/50 text-gray-300">
                    <td className="py-1">{s.date ? new Date(s.date).toLocaleDateString() : 'Unknown'}</td>
                    <td className="py-1">{parseInt(s.sound_count || '0') || 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

