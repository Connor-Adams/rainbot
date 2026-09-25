import { useQuery } from '@tanstack/react-query';
import { statsApi } from '@/lib/api';
import {
  EmptyState,
  StatsLoading,
  StatsError,
  StatCard,
  ChartContainer,
  chartColor,
  chartTheme,
} from '@/components/common';
import { StatGrid } from '@connor-adams/designsystem';
import { safeInt } from '@/lib/chartSafety';
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

interface EngagementSummary {
  total_tracks: string;
  completed: string;
  skipped: string;
  avg_played_seconds: string;
  avg_completion_percent: string;
}

interface SkipReason {
  skip_reason: string;
  count: string;
}

interface EngagementData {
  summary: EngagementSummary;
  skipReasons: SkipReason[];
  mostSkipped: unknown[];
  mostCompleted: unknown[];
}

export default function EngagementStats() {
  const { data, isLoading, error } = useQuery<EngagementData>({
    queryKey: ['stats', 'engagement'],
    queryFn: () => statsApi.engagement().then((r) => r.data),
    refetchInterval: 10000,
  });

  if (isLoading) return <StatsLoading message="Loading engagement..." />;
  if (error) return <StatsError error={error} message="Error loading engagement" />;
  if (!data) return null;

  const summary: EngagementSummary = data.summary || {
    total_tracks: '0',
    completed: '0',
    skipped: '0',
    avg_played_seconds: '0',
    avg_completion_percent: '0',
  };
  const completed = safeInt(summary.completed);
  const skipped = safeInt(summary.skipped);
  const totalTracks = safeInt(summary.total_tracks);
  const avgCompletionPercent = parseFloat(summary.avg_completion_percent || '0');
  const avgCompletionDisplay = isNaN(avgCompletionPercent)
    ? '0.0'
    : avgCompletionPercent.toFixed(1);
  const skipReasons = Array.isArray(data.skipReasons) ? data.skipReasons : [];

  if (totalTracks === 0) {
    return (
      <EmptyState
        icon="📈"
        message="No track engagement data available"
        submessage="Engagement statistics will appear here once tracks are played"
      />
    );
  }

  const other = Math.max(0, totalTracks - completed - skipped);
  // Colours are assigned before the filter so a zeroed slice never shifts the
  // remaining slices' colours — same as when these were hard-coded hex.
  const completionData = [
    { name: 'Completed', value: completed, color: chartColor(0) },
    { name: 'Skipped', value: skipped, color: chartColor(1) },
    { name: 'Other', value: other, color: chartColor(2) },
  ].filter((d) => d.value > 0);

  const skipData = skipReasons.map((r, idx) => ({
    name: r.skip_reason || 'Unknown',
    value: safeInt(r.count),
    color: chartColor(idx),
  }));

  return (
    <div className="space-y-6">
      <StatGrid columns="auto" minItemWidth={160} gap="lg">
        <StatCard value={totalTracks} label="Total Tracks" />
        <StatCard value={completed} label="Completed" />
        <StatCard value={skipped} label="Skipped" />
        <StatCard value={other} label="Other" />
        <StatCard value={`${avgCompletionDisplay}%`} label="Avg Completion" />
      </StatGrid>

      <div className="grid md:grid-cols-2 gap-6">
        {completionData.length > 0 && (
          <ChartContainer title="Completion vs Skips" height={280} className="mb-0!">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={completionData}
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
                  {completionData.map((entry, index) => (
                    <Cell key={index} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip contentStyle={chartTheme.tooltip.contentStyle} />
              </PieChart>
            </ResponsiveContainer>
          </ChartContainer>
        )}

        {skipData.length > 0 && (
          <ChartContainer
            title="Skip Reasons"
            height="auto"
            rowCount={skipData.length}
            className="mb-0!"
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={skipData} layout="vertical" margin={{ left: 80, right: 20 }}>
                <XAxis type="number" tick={chartTheme.axis.tick} />
                <YAxis type="category" dataKey="name" tick={chartTheme.axis.tick} width={75} />
                <Tooltip contentStyle={chartTheme.tooltip.contentStyle} />
                <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                  {skipData.map((entry, index) => (
                    <Cell key={index} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartContainer>
        )}
      </div>
    </div>
  );
}
