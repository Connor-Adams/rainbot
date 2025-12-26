import { useQuery } from '@tanstack/react-query'
import { statsApi } from '@/lib/api'
import type { UserStat } from '@/types'
import { escapeHtml } from '@/lib/utils'
import { StatsLoading, StatsError, StatsSection, StatsTable } from '@/components/common'

export default function UsersStats() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['stats', 'users'],
    queryFn: () => statsApi.users().then((res) => res.data),
    refetchInterval: 30000,
  })

  if (isLoading) return <StatsLoading message="Loading user statistics..." />
  if (error) return <StatsError error={error} />
  if (!data) return null

  const columns = [
    {
      id: 'username',
      header: 'Username',
      render: (user: UserStat) => {
        const username = user.username
          ? `${user.username}${user.discriminator && user.discriminator !== '0' ? `#${user.discriminator}` : ''}`
          : 'Unknown'
        return <span className="font-mono">{escapeHtml(username)}</span>
      },
      className: 'px-4 py-3 text-sm text-white',
    },
    {
      id: 'user_id',
      header: 'User ID',
      render: (user: UserStat) => <span className="font-mono">{escapeHtml(user.user_id)}</span>,
      className: 'px-4 py-3 text-sm text-white',
    },
    {
      id: 'guild_id',
      header: 'Guild ID',
      render: (user: UserStat) => <span className="font-mono">{escapeHtml(user.guild_id)}</span>,
      className: 'px-4 py-3 text-sm text-gray-400',
    },
    {
      id: 'commands',
      header: 'Commands',
      render: (user: UserStat) => (
        <span className="font-mono">{parseInt(user.command_count || '0').toLocaleString()}</span>
      ),
      className: 'px-4 py-3 text-sm text-gray-400',
    },
    {
      id: 'sounds',
      header: 'Sounds',
      render: (user: UserStat) => (
        <span className="font-mono">{parseInt(user.sound_count || '0').toLocaleString()}</span>
      ),
      className: 'px-4 py-3 text-sm text-gray-400',
    },
    {
      id: 'total',
      header: 'Total',
      render: (user: UserStat) => {
        const total = parseInt(user.command_count || '0') + parseInt(user.sound_count || '0')
        return <span className="font-mono">{total.toLocaleString()}</span>
      },
      className: 'px-4 py-3 text-sm text-gray-400',
    },
    {
      id: 'last_active',
      header: 'Last Active',
      render: (user: UserStat) =>
        user.last_active ? new Date(user.last_active).toLocaleString() : 'Never',
      className: 'px-4 py-3 text-sm text-gray-400',
    },
  ]

  return (
    <StatsSection title="Top Users">
      <StatsTable
        columns={columns}
        data={data.users || []}
        emptyMessage="No user data available"
        getRowKey={(user: UserStat) => `${user.user_id}-${user.guild_id}`}
      />
    </StatsSection>
  )
}
