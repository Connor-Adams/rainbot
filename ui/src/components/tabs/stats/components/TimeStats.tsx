import type { TimeDataPoint } from '@/types';
import { StatsLoading, StatsError } from '@/components/common';
import { useStatsQuery } from '@/hooks/useStatsQuery';
import { statsApi } from '@/lib/api';
import { safeInt, safeDateLabel } from '@/lib/chartSafety';

export default function TimeStats() {
  const { data, isLoading, error } = useStatsQuery({
    queryKey: ['stats', 'time'],
    queryFn: () => statsApi.time({ granularity: 'day' }),
  });

  if (isLoading) return <StatsLoading message="Loading time trends..." />;
  if (error) return <StatsError error={error} />;

  const commands = Array.isArray(data?.commands) ? data.commands : [];
  const sounds = Array.isArray(data?.sounds) ? data.sounds : [];

  if (!data || (commands.length === 0 && sounds.length === 0)) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-8 px-6 text-center">
        <span className="text-3xl opacity-50">📈</span>
        <p className="text-sm text-text-secondary">No time trend data available yet</p>
        <small className="text-xs text-text-muted">
          Trend data will appear as users interact with the bot
        </small>
      </div>
    );
  }

  const recentCommands = commands.slice(-14);
  const recentSounds = sounds.slice(-14);

  return (
    <div className="bg-surface border border-border rounded-xl p-6">
      <h3 className="text-xl text-text-primary mb-4">Usage Over Time</h3>
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
                <div key={idx} className="flex items-center gap-2">
                  <span className="text-xs text-text-secondary w-20">{safeDateLabel(c.date)}</span>
                  <div className="flex-1 bg-surface-hover rounded h-3">
                    <div className="h-full bg-primary rounded" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-xs text-text-secondary w-8 text-right">{val}</span>
                </div>
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
                <div key={idx} className="flex items-center gap-2">
                  <span className="text-xs text-text-secondary w-20">{safeDateLabel(s.date)}</span>
                  <div className="flex-1 bg-surface-hover rounded h-3">
                    <div className="h-full bg-secondary rounded" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-xs text-text-secondary w-8 text-right">{val}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
