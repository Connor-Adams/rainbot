import { useQuery } from '@tanstack/react-query';
import { statsApi } from '@/lib/api';
import type { QueueOperation } from '@/types';
import { safeInt } from '@/lib/chartSafety';
import {
  StatsLoading,
  StatsError,
  EmptyState,
  ChartContainer,
  chartTheme,
  chartColor,
} from '@/components/common';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

export default function QueueStats() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['stats', 'queue'],
    queryFn: () => statsApi.queue().then((res) => res.data),
    refetchInterval: 30000,
  });

  if (isLoading) return <StatsLoading message="Loading queue statistics..." />;
  if (error) return <StatsError error={error} />;

  const operations = Array.isArray(data?.operations) ? data.operations : [];

  if (!data || operations.length === 0) {
    return (
      <EmptyState
        icon="📋"
        message="No queue data available yet"
        submessage="Queue statistics will appear as users add and manage songs"
      />
    );
  }

  const chartData = operations.slice(0, 10).map((o: QueueOperation) => ({
    name: o.operation_type || 'Unknown',
    value: safeInt(o.count),
  }));

  return (
    // `height="auto"` with the DS defaults (32px per row, 200px floor)
    // reproduces the old `Math.max(200, chartData.length * 32)` exactly, and
    // resolves to a real pixel height — so the inner `style={{ height }}` div
    // ResponsiveContainer used to need is gone.
    <ChartContainer title="Queue Operations" height="auto" rowCount={chartData.length}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} layout="vertical" margin={{ left: 80, right: 20 }}>
          <XAxis type="number" tick={chartTheme.axis.tick} />
          <YAxis type="category" dataKey="name" tick={chartTheme.axis.tick} width={75} />
          <Tooltip contentStyle={chartTheme.tooltip.contentStyle} />
          <Bar dataKey="value" fill={chartColor(0)} radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </ChartContainer>
  );
}
