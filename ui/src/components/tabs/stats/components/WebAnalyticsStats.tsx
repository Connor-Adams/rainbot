import { useQuery } from '@tanstack/react-query';
import { statsApi } from '@/lib/api';
import { safeInt } from '@/lib/chartSafety';
import {
  StatsLoading,
  StatsError,
  EmptyState,
  StatsSection,
  StatsTable,
  ChartContainer,
  chartColor,
  chartTheme,
} from '@/components/common';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { pieSliceLabel } from './pieLabel';

interface EventType {
  event_type: string;
  count: string;
}

interface TopTarget {
  event_type: string;
  event_target: string;
  count: string;
}

interface ActiveUser {
  period: string;
  active_users: string;
}

interface GrowthData {
  date: string;
  events: string;
}

interface WebAnalyticsData {
  eventTypes: EventType[];
  topTargets: TopTarget[];
  activeUsers: ActiveUser[];
  growth: GrowthData[];
}

export default function WebAnalyticsStats() {
  const { data, isLoading, error } = useQuery<WebAnalyticsData>({
    queryKey: ['stats', 'web-analytics'],
    queryFn: () => statsApi.webAnalytics().then((r) => r.data),
    refetchInterval: 30000,
  });

  if (isLoading) return <StatsLoading message="Loading web analytics..." />;
  if (error) return <StatsError error={error} message="Error loading web analytics" />;

  const eventTypes = Array.isArray(data?.eventTypes) ? data.eventTypes : [];
  const topTargets = Array.isArray(data?.topTargets) ? data.topTargets : [];

  if (!data || eventTypes.length === 0) {
    return (
      <EmptyState
        icon="📊"
        message="No web analytics data available yet"
        submessage="Web analytics will appear as users interact with the dashboard"
      />
    );
  }

  // Colours are assigned before the filter so a zeroed slice never shifts the
  // remaining slices' colours — same as when these were hard-coded hex.
  const eventData = eventTypes
    .map((e, idx) => ({
      name: e.event_type || 'Unknown',
      value: safeInt(e.count),
      color: chartColor(idx),
    }))
    .filter((d) => d.value > 0);

  const targetData = topTargets.slice(0, 10).map((t) => ({
    name: `${t.event_type}: ${t.event_target}`.substring(0, 25),
    value: safeInt(t.count),
  }));

  const detailRows = topTargets.slice(0, 15);

  const detailColumns = [
    {
      id: 'event_type',
      header: 'Event Type',
      render: (target: TopTarget) => target.event_type,
      className: 'py-2 px-4 text-text-secondary',
    },
    {
      id: 'event_target',
      header: 'Target',
      render: (target: TopTarget) => target.event_target,
      className: 'py-2 px-4 font-mono text-sm text-text-secondary',
    },
    {
      id: 'count',
      header: 'Count',
      render: (target: TopTarget) => target.count,
      className: 'py-2 px-4 text-text-secondary',
    },
  ];

  return (
    <div className="space-y-6">
      <div className="grid md:grid-cols-2 gap-6">
        {eventData.length > 0 && (
          <ChartContainer title="Event Types" height={280}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={eventData}
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
                  {eventData.map((entry, index) => (
                    <Cell key={index} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip contentStyle={chartTheme.tooltip.contentStyle} />
              </PieChart>
            </ResponsiveContainer>
          </ChartContainer>
        )}

        {targetData.length > 0 && (
          <ChartContainer title="Top Event Targets" height="auto" rowCount={targetData.length}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={targetData} layout="vertical" margin={{ left: 100, right: 20 }}>
                <XAxis type="number" tick={chartTheme.axis.tick} />
                <YAxis type="category" dataKey="name" tick={chartTheme.axis.tick} width={95} />
                <Tooltip contentStyle={chartTheme.tooltip.contentStyle} />
                <Bar dataKey="value" fill={chartColor(0)} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartContainer>
        )}
      </div>

      {topTargets.length > 0 && (
        <StatsSection title="Event Details">
          <StatsTable
            columns={detailColumns}
            data={detailRows}
            getRowKey={(target: TopTarget) => `${target.event_type}:${target.event_target}`}
          />
        </StatsSection>
      )}
    </div>
  );
}
