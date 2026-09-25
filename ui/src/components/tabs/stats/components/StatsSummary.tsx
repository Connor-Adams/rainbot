import type { StatsSummary as StatsSummaryType } from '@/types';
import { StatsLoading, StatsError, StatCard } from '@/components/common';
import { StatGrid } from '@connor-adams/designsystem';
import { useStatsQuery } from '@/hooks/useStatsQuery';
import { statsApi } from '@/lib/api';

export default function StatsSummary() {
  const { data, isLoading, error } = useStatsQuery<StatsSummaryType>({
    queryKey: ['stats', 'summary'],
    queryFn: ({ signal }) => statsApi.summary({ signal }),
  });

  if (isLoading) return <StatsLoading />;
  if (error) return <StatsError error={error} message="Error loading statistics" />;
  if (!data) return null;

  const successRate =
    typeof data.successRate === 'number' && !isNaN(data.successRate)
      ? data.successRate.toFixed(1)
      : '0.0';

  return (
    <div className="stats-summary space-y-6">
      {/* `StatGrid columns="auto"` is the same auto-fit grid the hand-rolled
          `grid-cols-[repeat(auto-fit,minmax(200px,1fr))]` expressed, with the
          200px track floor carried over as `minItemWidth`. */}
      <StatGrid className="stats-cards" columns="auto" minItemWidth={200} gap="lg">
        <StatCard value={data.totalCommands} label="Total Commands" />
        <StatCard value={data.totalSounds} label="Sounds Played" />
        <StatCard value={data.uniqueUsers} label="Active Users" />
        <StatCard value={data.uniqueGuilds} label="Active Guilds" />
        <StatCard value={`${successRate}%`} label="Success Rate" />
      </StatGrid>
    </div>
  );
}
