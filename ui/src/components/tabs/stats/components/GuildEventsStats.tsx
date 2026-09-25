import { useQuery } from '@tanstack/react-query';
import { statsApi } from '@/lib/api';
import {
  EmptyState,
  StatsLoading,
  StatsError,
  StatsSection,
  StatsTable,
  ChartContainer,
  chartTheme,
  chartColor,
} from '@/components/common';
import { safeInt, safeDateLabel } from '@/lib/chartSafety';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { pieSliceLabel } from './pieLabel';

interface EventSummary {
  event_type: string;
  count: string;
}

interface GuildEvent {
  event_type: string;
  guild_id: string;
  guild_name: string;
  member_count: string;
  created_at: string;
}

interface GrowthEntry {
  date: string;
  joins: string;
  leaves: string;
}

interface GuildEventsData {
  summary: EventSummary[];
  recentEvents: GuildEvent[];
  growth: GrowthEntry[];
}

export default function GuildEventsStats() {
  const { data, isLoading, error } = useQuery<GuildEventsData>({
    queryKey: ['stats', 'guild-events'],
    queryFn: () => statsApi.guildEvents().then((r) => r.data),
    refetchInterval: 10000,
  });

  if (isLoading) return <StatsLoading message="Loading guild events..." />;
  if (error) return <StatsError error={error} message="Error loading guild events" />;

  const summary = Array.isArray(data?.summary) ? data.summary : [];
  const recentEvents = Array.isArray(data?.recentEvents) ? data.recentEvents : [];
  const growth = Array.isArray(data?.growth) ? data.growth : [];

  if (!data || (summary.length === 0 && recentEvents.length === 0)) {
    return (
      <EmptyState
        icon="🏠"
        message="No guild event data available"
        submessage="Guild join/leave events will appear here as the bot is added to or removed from servers"
      />
    );
  }

  const summaryData = summary
    .map((s) => ({
      name: (s.event_type || 'Unknown').replace('bot_', ''),
      value: safeInt(s.count),
    }))
    .filter((d) => d.value > 0);

  const eventColumns = [
    {
      id: 'event',
      header: 'Event',
      render: (event: GuildEvent) => (
        <span
          className={`px-2 py-1 rounded text-xs ${event.event_type === 'bot_added' ? 'bg-success/10 text-success-light' : 'bg-danger/10 text-danger-light'}`}
        >
          {event.event_type.replace('bot_', '')}
        </span>
      ),
      className: 'px-4 py-2 text-text-secondary',
    },
    {
      id: 'guild',
      header: 'Guild',
      render: (event: GuildEvent) => event.guild_name || event.guild_id,
      className: 'px-4 py-2 text-text-secondary',
    },
    {
      id: 'members',
      header: 'Members',
      render: (event: GuildEvent) => event.member_count,
      className: 'px-4 py-2 text-text-secondary',
    },
    {
      id: 'date',
      header: 'Date',
      render: (event: GuildEvent) => safeDateLabel(event.created_at),
      className: 'px-4 py-2 text-sm text-text-secondary',
    },
  ];

  return (
    <div className="space-y-6">
      {summaryData.length > 0 && (
        <ChartContainer title="Guild Events Summary" height={280}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={summaryData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={80}
                paddingAngle={2}
                label={pieSliceLabel}
                labelLine={{ stroke: chartTheme.tooltip.labelLine }}
              >
                {summaryData.map((_, index) => (
                  <Cell key={index} fill={chartColor(index)} />
                ))}
              </Pie>
              <Tooltip contentStyle={chartTheme.tooltip.contentStyle} />
            </PieChart>
          </ResponsiveContainer>
        </ChartContainer>
      )}

      {growth.length > 0 && (
        <StatsSection title="Guild Growth Over Time">
          <div className="space-y-2">
            {growth.slice(-14).map((g, idx) => {
              const joins = safeInt(g.joins);
              const leaves = safeInt(g.leaves);
              const net = joins - leaves;
              return (
                <div key={idx} className="flex items-center gap-3 text-sm">
                  <span className="text-text-secondary w-24">{safeDateLabel(g.date)}</span>
                  <span className="text-success-light w-16">+{joins}</span>
                  <span className="text-danger-light w-16">-{leaves}</span>
                  <span className={`w-16 ${net >= 0 ? 'text-success-light' : 'text-danger-light'}`}>
                    {net >= 0 ? '+' : ''}
                    {net}
                  </span>
                </div>
              );
            })}
          </div>
        </StatsSection>
      )}

      {recentEvents.length > 0 && (
        <StatsSection title="Recent Guild Events">
          <StatsTable<GuildEvent>
            columns={eventColumns}
            data={recentEvents.slice(0, 10)}
            emptyMessage="No recent guild events"
            getRowKey={(event) => `${event.guild_id}-${event.created_at}-${event.event_type}`}
          />
        </StatsSection>
      )}
    </div>
  );
}
