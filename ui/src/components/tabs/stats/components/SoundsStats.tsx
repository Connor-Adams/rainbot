import { useQuery } from '@tanstack/react-query';
import { statsApi } from '@/lib/api';
import type { SoundStat, SourceType, SoundboardBreakdown } from '@/types';
import { safeInt } from '@/lib/chartSafety';
import {
  StatsLoading,
  StatsError,
  EmptyState,
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

export default function SoundsStats() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['stats', 'sounds'],
    queryFn: () => statsApi.sounds().then((res) => res.data),
    refetchInterval: 30000,
  });

  if (isLoading) {
    return <StatsLoading message="Loading sound statistics..." />;
  }

  if (error) {
    return <StatsError error={error} />;
  }

  const sounds = Array.isArray(data?.sounds) ? data.sounds : [];
  const sourceTypes = Array.isArray(data?.sourceTypes) ? data.sourceTypes : [];
  const soundboardBreakdown = Array.isArray(data?.soundboardBreakdown)
    ? data.soundboardBreakdown
    : [];

  if (!data || sounds.length === 0) {
    return (
      <EmptyState
        icon="🔊"
        message="No sound data available yet"
        submessage="Sound statistics will appear as users play sounds"
      />
    );
  }

  const barData = sounds.slice(0, 10).map((s: SoundStat) => ({
    name: (s.sound_name || 'Unknown').substring(0, 20),
    value: safeInt(s.count),
  }));

  // Colours are assigned before the filter so a zeroed slice never shifts the
  // remaining slices' colours — same as when these were hard-coded hex.
  const sourceData = sourceTypes
    .map((s: SourceType, idx: number) => ({
      name: s.source_type || 'Unknown',
      value: safeInt(s.count),
      color: chartColor(idx),
    }))
    .filter((d: { value: number }) => d.value > 0);

  const sbData = soundboardBreakdown
    .map((b: SoundboardBreakdown) => ({
      name: b.is_soundboard ? 'Soundboard' : 'Regular',
      value: safeInt(b.count),
      color: b.is_soundboard ? chartColor(1) : chartColor(0),
    }))
    .filter((d: { value: number }) => d.value > 0);

  return (
    <div className="space-y-6">
      {barData.length > 0 && (
        <ChartContainer title="Top Sounds" height="auto" rowCount={barData.length}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={barData} layout="vertical" margin={{ left: 80, right: 20 }}>
              <XAxis type="number" tick={chartTheme.axis.tick} />
              <YAxis type="category" dataKey="name" tick={chartTheme.axis.tick} width={75} />
              <Tooltip contentStyle={chartTheme.tooltip.contentStyle} />
              <Bar dataKey="value" fill={chartColor(1)} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartContainer>
      )}

      <div className="grid md:grid-cols-2 gap-6">
        {sourceData.length > 0 && (
          <ChartContainer title="Source Type Breakdown" height={280}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={sourceData}
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
                  {sourceData.map((entry: { color: string }, index: number) => (
                    <Cell key={index} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip contentStyle={chartTheme.tooltip.contentStyle} />
              </PieChart>
            </ResponsiveContainer>
          </ChartContainer>
        )}

        {sbData.length > 0 && (
          <ChartContainer title="Soundboard vs Regular" height={280}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={sbData}
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
                  {sbData.map((entry: { color: string }, index: number) => (
                    <Cell key={index} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip contentStyle={chartTheme.tooltip.contentStyle} />
              </PieChart>
            </ResponsiveContainer>
          </ChartContainer>
        )}
      </div>
    </div>
  );
}
