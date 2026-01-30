import { useQuery } from '@tanstack/react-query';
import { statsApi } from '@/lib/api';
import { EmptyState } from '@/components/common';
import { safeInt, safeDateLabel } from '@/lib/chartSafety';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';

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

  if (isLoading)
    return <div className="stats-loading text-center py-12">Loading guild events...</div>;
  if (error) return <div className="stats-error text-center py-12">Error loading guild events</div>;

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
      color: s.event_type === 'bot_added' ? 'rgb(34, 197, 94)' : 'rgb(239, 68, 68)',
    }))
    .filter((d) => d.value > 0);

  return (
    <div className="space-y-6">
      {summaryData.length > 0 && (
        <div className="bg-surface border border-border rounded-xl p-6">
          <h3 className="text-lg text-text-primary mb-4">Guild Events Summary</h3>
          <div style={{ width: '100%', height: 280 }}>
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
                  label={({ name, percent }: { name: string; percent: number }) =>
                    `${name} (${(percent * 100).toFixed(0)}%)`
                  }
                  labelLine={{ stroke: '#6b7280' }}
                >
                  {summaryData.map((entry, index) => (
                    <Cell key={index} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1f2937',
                    border: '1px solid #374151',
                    borderRadius: 8,
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {growth.length > 0 && (
        <div className="bg-surface border border-border rounded-xl p-6">
          <h3 className="text-xl text-text-primary mb-4">Guild Growth Over Time</h3>
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
        </div>
      )}

      {recentEvents.length > 0 && (
        <div className="bg-surface border border-border rounded-xl p-6">
          <h3 className="text-xl text-text-primary mb-4">Recent Guild Events</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-text-secondary border-b border-border">
                  <th className="pb-2 px-4">Event</th>
                  <th className="pb-2 px-4">Guild</th>
                  <th className="pb-2 px-4">Members</th>
                  <th className="pb-2 px-4">Date</th>
                </tr>
              </thead>
              <tbody>
                {recentEvents.slice(0, 10).map((event, idx) => (
                  <tr key={idx} className="border-b border-border/50 text-text-secondary">
                    <td className="py-2 px-4">
                      <span
                        className={`px-2 py-1 rounded text-xs ${event.event_type === 'bot_added' ? 'bg-success/10 text-success-light' : 'bg-danger/10 text-danger-light'}`}
                      >
                        {event.event_type.replace('bot_', '')}
                      </span>
                    </td>
                    <td className="py-2 px-4">{event.guild_name || event.guild_id}</td>
                    <td className="py-2 px-4">{event.member_count}</td>
                    <td className="py-2 px-4 text-sm">{safeDateLabel(event.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
