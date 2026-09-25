import { useQuery } from '@tanstack/react-query';
import type { BotStatus, GuildStat } from '@/types';
import { StatsLoading, StatsError, StatsSection, StatsTable } from '@/components/common';
import { useStatsQuery } from '@/hooks/useStatsQuery';
import { botApi, statsApi } from '@/lib/api';

export default function GuildsStats() {
  const { data, isLoading, error } = useStatsQuery({
    queryKey: ['stats', 'guilds'],
    queryFn: ({ signal }) => statsApi.guilds({ signal }),
  });

  // `/api/stats/guilds` only knows the snowflake; `/api/status` already carries
  // `guilds: [{ id, name }]` for every guild the bot is currently in, and the
  // header's picker has it cached under this very key. Reusing the key joins the
  // name in without a second round trip in the common case, and without any
  // server change.
  //
  // Deliberately NOT gating the table on this query: stats rows are history, so
  // a guild the bot has since left will never have a name here, and neither a
  // slow nor a failing `/status` should hide guild statistics. The id stays the
  // fallback so every row still identifies itself.
  const { data: status } = useQuery<BotStatus>({
    queryKey: ['bot-status'],
    queryFn: ({ signal }) => botApi.getStatus({ signal }).then((res) => res.data),
    refetchInterval: 5000,
  });

  const guildNames = new Map((status?.guilds ?? []).map((guild) => [guild.id, guild.name]));

  if (isLoading) return <StatsLoading message="Loading guild statistics..." />;
  if (error) return <StatsError error={error} />;
  if (!data) return null;

  const columns = [
    {
      id: 'guild_id',
      header: 'Guild',
      render: (guild: GuildStat) => {
        const name = guildNames.get(guild.guild_id);
        // `font-mono` only on the id: an 18-digit snowflake in a monospace face
        // is what made this the widest column in the table and pushed it past
        // 1000px. A name reads as prose and sets its own width.
        return name ? <span>{name}</span> : <span className="font-mono">{guild.guild_id}</span>;
      },
      className: 'px-4 py-3 text-sm text-text-primary',
    },
    {
      id: 'commands',
      header: 'Commands',
      render: (guild: GuildStat) => (
        <span className="font-mono">{parseInt(guild.command_count || '0').toLocaleString()}</span>
      ),
      className: 'px-4 py-3 text-sm text-text-secondary',
    },
    {
      id: 'sounds',
      header: 'Sounds',
      render: (guild: GuildStat) => (
        <span className="font-mono">{parseInt(guild.sound_count || '0').toLocaleString()}</span>
      ),
      className: 'px-4 py-3 text-sm text-text-secondary',
    },
    {
      id: 'unique_users',
      header: 'Unique Users',
      render: (guild: GuildStat) => (
        <span className="font-mono">{parseInt(guild.unique_users || '0').toLocaleString()}</span>
      ),
      className: 'px-4 py-3 text-sm text-text-secondary',
    },
    {
      id: 'total',
      header: 'Total',
      render: (guild: GuildStat) => {
        const total = parseInt(guild.command_count || '0') + parseInt(guild.sound_count || '0');
        return <span className="font-mono">{total.toLocaleString()}</span>;
      },
      className: 'px-4 py-3 text-sm text-text-secondary',
    },
    {
      id: 'last_active',
      header: 'Last Active',
      render: (guild: GuildStat) =>
        guild.last_active ? new Date(guild.last_active).toLocaleString() : 'Never',
      className: 'px-4 py-3 text-sm text-text-secondary',
    },
  ];

  return (
    <StatsSection title="Top Guilds">
      <StatsTable
        columns={columns}
        data={data.guilds || []}
        emptyMessage="No guild data available"
        getRowKey={(guild: GuildStat) => guild.guild_id}
      />
    </StatsSection>
  );
}
