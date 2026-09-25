import type { TimeDataPoint } from '@/types';
import {
  StatsLoading,
  StatsError,
  StatsSection,
  EmptyState,
  chartColor,
} from '@/components/common';
import { Progress } from '@connor-adams/designsystem';
import { useStatsQuery } from '@/hooks/useStatsQuery';
import { statsApi } from '@/lib/api';
import { safeInt, safeDateLabel } from '@/lib/chartSafety';

export default function TimeStats() {
  const { data, isLoading, error } = useStatsQuery({
    queryKey: ['stats', 'time'],
    queryFn: ({ signal }) => statsApi.time({ granularity: 'day', signal }),
  });

  if (isLoading) return <StatsLoading message="Loading time trends..." />;
  if (error) return <StatsError error={error} />;

  const commands = Array.isArray(data?.commands) ? data.commands : [];
  const sounds = Array.isArray(data?.sounds) ? data.sounds : [];

  if (!data || (commands.length === 0 && sounds.length === 0)) {
    return (
      <EmptyState
        icon="📈"
        message="No time trend data available yet"
        submessage="Trend data will appear as users interact with the bot"
      />
    );
  }

  const recentCommands = commands.slice(-14);
  const recentSounds = sounds.slice(-14);

  return (
    <StatsSection title="Usage Over Time">
      <div className="grid md:grid-cols-2 gap-6">
        <div>
          <h4 className="text-lg text-primary-light mb-3">Commands by Day</h4>
          <div className="space-y-2">
            {recentCommands.map((c: TimeDataPoint, idx: number) => {
              const maxVal = Math.max(
                ...recentCommands.map((x: TimeDataPoint) => safeInt(x.command_count)),
                1
              );
              const val = safeInt(c.command_count);
              const pct = (val / maxVal) * 100;
              return (
                <Progress
                  key={idx}
                  size="lg"
                  tone="primary"
                  value={pct}
                  label={safeDateLabel(c.date)}
                  valueText={String(val)}
                />
              );
            })}
          </div>
        </div>
        <div>
          <h4 className="text-lg text-secondary-light mb-3">Sounds by Day</h4>
          <div className="space-y-2">
            {recentSounds.map((s: TimeDataPoint, idx: number) => {
              const maxVal = Math.max(
                ...recentSounds.map((x: TimeDataPoint) => safeInt(x.sound_count)),
                1
              );
              const val = safeInt(s.sound_count);
              const pct = (val / maxVal) * 100;
              return (
                // The old fill was `bg-secondary` — Rainbot's violet, which the
                // design system has no semantic `tone` for (`--secondary` means
                // "quiet neutral chip surface" there). `chartColor(1)` is
                // `var(--chart-2)`, which the brand points at the same violet,
                // so the colour is preserved and still tracks the theme.
                <Progress
                  key={idx}
                  size="lg"
                  tone={chartColor(1)}
                  value={pct}
                  label={safeDateLabel(s.date)}
                  valueText={String(val)}
                />
              );
            })}
          </div>
        </div>
      </div>
    </StatsSection>
  );
}
