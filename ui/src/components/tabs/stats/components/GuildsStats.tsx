import type { GuildStat } from '@/types'
import { escapeHtml } from '@/lib/utils'
import { StatsLoading, StatsError, StatsSection, StatsTable } from '@/components/common'
import { useStatsQuery } from '@/hooks/useStatsQuery'
import { statsApi } from '@/lib/api'

export default function GuildsStats() {
  const { data, isLoading, error } = useStatsQuery({
    queryKey: ['stats', 'guilds'],
    queryFn: () => statsApi.guilds(),
  })

  if (isLoading) return <StatsLoading message="Loading guild statistics..." />
  if (error) return <StatsError error={error} />
  if (!data) return null

  const columns = [
    {
      id: 'guild_id',
      header: 'Guild ID',
      render: (guild: GuildStat) => <span className="font-mono">{escapeHtml(guild.guild_id)}</span>,
      className: 'px-4 py-3 text-sm text-white',
    },
    {
      id: 'commands',
      header: 'Commands',
      render: (guild: GuildStat) => (
        <span className="font-mono">{parseInt(guild.command_count || '0').toLocaleString()}</span>
      ),
      className: 'px-4 py-3 text-sm text-gray-400',
    },
    {
      id: 'sounds',
      header: 'Sounds',
      render: (guild: GuildStat) => (
        <span className="font-mono">{parseInt(guild.sound_count || '0').toLocaleString()}</span>
      ),
      className: 'px-4 py-3 text-sm text-gray-400',
    },
    {
      id: 'unique_users',
      header: 'Unique Users',
      render: (guild: GuildStat) => (
        <span className="font-mono">{parseInt(guild.unique_users || '0').toLocaleString()}</span>
      ),
      className: 'px-4 py-3 text-sm text-gray-400',
    },
    {
      id: 'total',
      header: 'Total',
      render: (guild: GuildStat) => {
        const total = parseInt(guild.command_count || '0') + parseInt(guild.sound_count || '0')
        return <span className="font-mono">{total.toLocaleString()}</span>
      },
      className: 'px-4 py-3 text-sm text-gray-400',
    },
    {
      id: 'last_active',
      header: 'Last Active',
      render: (guild: GuildStat) =>
        guild.last_active ? new Date(guild.last_active).toLocaleString() : 'Never',
      className: 'px-4 py-3 text-sm text-gray-400',
    },
  ]

  return (
    <StatsSection title="Top Guilds">
      <StatsTable
        columns={columns}
        data={data.guilds || []}
        emptyMessage="No guild data available"
        getRowKey={(guild: GuildStat) => guild.guild_id}
      />
    </StatsSection>
  )
}

