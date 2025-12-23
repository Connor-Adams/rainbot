import { useQuery } from '@tanstack/react-query'
import { statsApi } from '@/lib/api'
import type { UserStat } from '@/types'
import { escapeHtml } from '@/lib/utils'

export default function UsersStats() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['stats', 'users'],
    queryFn: () => statsApi.users().then((res) => res.data),
    refetchInterval: 30000,
  })

  if (isLoading) {
    return <div className="stats-loading text-center py-12 text-gray-400">Loading user statistics...</div>
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
      <h3 className="text-xl text-white mb-4">Top Users</h3>
      <table className="stats-table w-full">
        <thead>
          <tr>
            <th>Username</th>
            <th>User ID</th>
            <th>Guild ID</th>
            <th>Commands</th>
            <th>Sounds</th>
            <th>Total</th>
            <th>Last Active</th>
          </tr>
        </thead>
        <tbody>
          {(data.users || []).map((user: UserStat) => {
            const commandCount = parseInt(user.command_count || '0')
            const soundCount = parseInt(user.sound_count || '0')
            const total = commandCount + soundCount
            const lastActive = user.last_active ? new Date(user.last_active).toLocaleString() : 'Never'
            const username = user.username
              ? `${user.username}${user.discriminator && user.discriminator !== '0' ? `#${user.discriminator}` : ''}`
              : 'Unknown'
            return (
              <tr key={`${user.user_id}-${user.guild_id}`} className="hover:bg-gray-700/50 transition-colors">
                <td className="px-4 py-3 text-sm text-white font-mono">{escapeHtml(username)}</td>
                <td className="px-4 py-3 text-sm text-white font-mono">{escapeHtml(user.user_id)}</td>
                <td className="px-4 py-3 text-sm text-gray-400 font-mono">{escapeHtml(user.guild_id)}</td>
                <td className="px-4 py-3 text-sm text-gray-400 font-mono">{commandCount.toLocaleString()}</td>
                <td className="px-4 py-3 text-sm text-gray-400 font-mono">{soundCount.toLocaleString()}</td>
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
