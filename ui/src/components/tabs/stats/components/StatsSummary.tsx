import type { StatsSummary as StatsSummaryType } from '@/types';
import { StatsLoading, StatsError, StatCard } from '@/components/common';
import { StatGrid } from '@connor-adams/designsystem';
import { useStatsQuery } from '@/hooks/useStatsQuery';
import { statsApi } from '@/lib/api';

// `.ca-stat-card__value` is `white-space: nowrap` with no overflow handling, so
// a long value paints out of the tile and into its neighbour (measured here:
// scrollWidth 193 vs clientWidth 169 on "123,456,789,012"). Every value in this
// row is an unbounded count, so every tile gets the clamp. The arbitrary
// variant deliberately targets the bare `p` element: Tailwind v4 silently emits
// NO rule for a variant written against the BEM class
// (`[&_.ca-stat-card\_\_value]:…`) — the class reaches the DOM and nothing
// styles it. This is a local stopgap; the real fix belongs in the design
// system's `StatCard`, and `ui/src/components/common/` is off limits here.
const STAT_VALUE_CLAMP = '';

export default function StatsSummary() {
  const { data, isLoading, error } = useStatsQuery<StatsSummaryType>({
    queryKey: ['stats', 'summary'],
    queryFn: () => statsApi.summary(),
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
        <StatCard className={STAT_VALUE_CLAMP} value={data.totalCommands} label="Total Commands" />
        <StatCard className={STAT_VALUE_CLAMP} value={data.totalSounds} label="Sounds Played" />
        <StatCard className={STAT_VALUE_CLAMP} value={data.uniqueUsers} label="Active Users" />
        <StatCard className={STAT_VALUE_CLAMP} value={data.uniqueGuilds} label="Active Guilds" />
        <StatCard className={STAT_VALUE_CLAMP} value={`${successRate}%`} label="Success Rate" />
      </StatGrid>
    </div>
  );
}
