import { useQuery } from '@tanstack/react-query'
import { statsApi } from '@/lib/api'
import type { GuildStat } from '@/types'
import { escapeHtml } from '@/lib/utils'

export default function GuildsStats() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['stats', 'guilds'],
    queryFn: () => statsApi.guilds().then((res) => res.data),
    refetchInterval: 30000,
  })

  if (isLoading) {
    return <div className="stats-loading text-center py-12 text-gray-400">Loading guild statistics...</div>
  }

  if (error) {
    return (
      <div className="stats-error text-center py-12 text-red-400">
        Error: {error instanceof Error ? error.message : 'Unknown error'}
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="stats-table-section bg-gray-800 border border-gray-700 rounded-xl p-6">
      <h3 className="text-xl text-white mb-4">Top Guilds</h3>
      <table className="stats-table w-full">
        <thead>
          <tr>
            <th>Guild ID</th>
            <th>Commands</th>
            <th>Sounds</th>
            <th>Unique Users</th>
            <th>Total</th>
            <th>Last Active</th>
          </tr>
        </thead>
        <tbody>
          {(data.guilds || []).map((guild: GuildStat) => {
            const commandCount = parseInt(guild.command_count || '0')
            const soundCount = parseInt(guild.sound_count || '0')
            const total = commandCount + soundCount
            const lastActive = guild.last_active ? new Date(guild.last_active).toLocaleString() : 'Never'
            return (
              <tr key={guild.guild_id} className="hover:bg-gray-700/50 transition-colors">
                <td className="px-4 py-3 text-sm text-white font-mono">{escapeHtml(guild.guild_id)}</td>
                <td className="px-4 py-3 text-sm text-gray-400 font-mono">{commandCount.toLocaleString()}</td>
                <td className="px-4 py-3 text-sm text-gray-400 font-mono">{soundCount.toLocaleString()}</td>
                <td className="px-4 py-3 text-sm text-gray-400 font-mono">
                  {parseInt(guild.unique_users || '0').toLocaleString()}
                </td>
                <td className="px-4 py-3 text-sm text-gray-400 font-mono">{total.toLocaleString()}</td>
                <td className="px-4 py-3 text-sm text-gray-400">{lastActive}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

