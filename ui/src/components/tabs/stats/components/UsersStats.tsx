import type { UserStat } from '@/types'
import { escapeHtml } from '@/lib/utils'
import { StatsLoading, StatsError, StatsSection, StatsTable } from '@/components/common'
import { useStatsQuery } from '@/hooks/useStatsQuery'
import { statsApi } from '@/lib/api'

export default function UsersStats() {
  const { data, isLoading, error } = useStatsQuery<{ users: UserStat[] }>({
    queryKey: ['stats', 'users'],
    queryFn: () => statsApi.users(),
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
      className: 'px-4 py-3 text-sm text-text-primary',
    },
    {
      id: 'user_id',
      header: 'User ID',
      render: (user: UserStat) => <span className="font-mono">{escapeHtml(user.user_id)}</span>,
      className: 'px-4 py-3 text-sm text-text-primary',
    },
    {
      id: 'guild_id',
      header: 'Guild ID',
      render: (user: UserStat) => <span className="font-mono">{escapeHtml(user.guild_id)}</span>,
      className: 'px-4 py-3 text-sm text-text-secondary',
    },
    {
      id: 'commands',
      header: 'Commands',
      render: (user: UserStat) => (
        <span className="font-mono">{parseInt(user.command_count || '0').toLocaleString()}</span>
      ),
      className: 'px-4 py-3 text-sm text-text-secondary',
    },
    {
      id: 'sounds',
      header: 'Sounds',
      render: (user: UserStat) => (
        <span className="font-mono">{parseInt(user.sound_count || '0').toLocaleString()}</span>
      ),
      className: 'px-4 py-3 text-sm text-text-secondary',
    },
    {
      id: 'total',
      header: 'Total',
      render: (user: UserStat) => {
        const total = parseInt(user.command_count || '0') + parseInt(user.sound_count || '0')
        return <span className="font-mono">{total.toLocaleString()}</span>
      },
      className: 'px-4 py-3 text-sm text-text-secondary',
    },
    {
      id: 'last_active',
      header: 'Last Active',
      render: (user: UserStat) =>
        user.last_active ? new Date(user.last_active).toLocaleString() : 'Never',
      className: 'px-4 py-3 text-sm text-text-secondary',
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
