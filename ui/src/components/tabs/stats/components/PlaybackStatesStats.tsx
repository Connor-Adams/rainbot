import { statsApi } from '@/lib/api';
import { useStatsQuery } from '@/hooks/useStatsQuery';
import { StatsLoading, StatsError, StatsSection } from '@/components/common';
import { Progress } from '@connor-adams/designsystem';
import { safeInt } from '@/lib/chartSafety';

type PlaybackState = {
  state_type: string;
  count: string;
};

type VolumeDistributionEntry = {
  volume_level: number;
  count: string;
};

type PausePatternByHourEntry = {
  hour: string;
  pauses: string;
  resumes: string;
};

type PlaybackStatesResponse = {
  stateTypes: PlaybackState[];
  volumeDistribution: VolumeDistributionEntry[];
  pausePatternByHour: PausePatternByHourEntry[];
};

export default function PlaybackStatesStats() {
  const { data, isLoading, error } = useStatsQuery<PlaybackStatesResponse>({
    queryKey: ['stats', 'playback-states'],
    queryFn: ({ signal }) => statsApi.playbackStates({ signal }),
    refetchInterval: 10000,
  });

  if (isLoading) return <StatsLoading message="Loading…" />;
  if (error) return <StatsError error={error} />;
  if (!data) return null;

  /**
   * `Math.max(..., 1)` — the same floor `TimeStats` and `RetentionStats` already
   * use, and `safeInt` for the same reason they do.
   *
   * These were computed inside the `.map`, from `Math.max(...counts.map(Number))`
   * with no floor: a single row whose `count` the server omitted made the maximum
   * `NaN`, every bar in the section computed `n / NaN * 100` and flattened to 0%,
   * and that row printed a literal `NaN` as its value text. An all-zero response
   * divided by zero for the same reason. Hoisting them out of the row callback
   * also stops recomputing the maximum once per row.
   */
  const maxPlaybackStateCount = Math.max(
    ...(data.stateTypes || []).map((stateEntry: PlaybackState) => safeInt(stateEntry.count)),
    1
  );
  const maxVolumeLevelCount = Math.max(
    ...(data.volumeDistribution || []).map((volumeLevelEntry: VolumeDistributionEntry) =>
      safeInt(volumeLevelEntry.count)
    ),
    1
  );

  return (
    <div className="space-y-8">
      {/* Playback state counts */}
      <StatsSection title="Playback State Changes">
        <div className="space-y-3">
          {(data.stateTypes || []).map((playbackState: PlaybackState) => {
            const playbackStateCount = safeInt(playbackState.count);
            const playbackStateBarWidth = (playbackStateCount / maxPlaybackStateCount) * 100;

            return (
              <Progress
                key={playbackState.state_type}
                size="lg"
                tone="primary"
                value={playbackStateBarWidth}
                label={<span className="capitalize">{playbackState.state_type}</span>}
                valueText={String(playbackStateCount)}
              />
            );
          })}
        </div>
      </StatsSection>

      {/* Volume distribution */}
      <StatsSection title="Volume Levels">
        <div className="space-y-3">
          {(data.volumeDistribution || []).map((volumeEntry: VolumeDistributionEntry) => {
            const volumeLevelCount = safeInt(volumeEntry.count);
            const volumeLevelBarWidth = (volumeLevelCount / maxVolumeLevelCount) * 100;

            return (
              <Progress
                key={volumeEntry.volume_level}
                size="lg"
                tone="success"
                value={volumeLevelBarWidth}
                label={`Volume ${volumeEntry.volume_level}`}
                valueText={String(volumeLevelCount)}
              />
            );
          })}
        </div>
      </StatsSection>

      {/* Pause / resume by hour */}
      <StatsSection title="Pauses & Resumes by Hour">
        <div className="space-y-4">
          {(data.pausePatternByHour || []).map(
            (hourlyPauseResumeStats: PausePatternByHourEntry) => {
              // Same `safeInt`: this section's `totalPauseResumeCount === 0`
              // guard catches a genuine zero but not a `NaN` from a missing field.
              const pauseCount = safeInt(hourlyPauseResumeStats.pauses);
              const resumeCount = safeInt(hourlyPauseResumeStats.resumes);
              const totalPauseResumeCount = pauseCount + resumeCount;

              const pauseBarWidth =
                totalPauseResumeCount === 0 ? 0 : (pauseCount / totalPauseResumeCount) * 100;

              const resumeBarWidth =
                totalPauseResumeCount === 0 ? 0 : (resumeCount / totalPauseResumeCount) * 100;

              // The two bands are the stacked bar the markup hand-rolled as a
              // `flex overflow-hidden` track with two inner divs. They already
              // sum to exactly 100 (or to 0 when the hour has no events), so
              // `segments` scales nothing and drops nothing. Naming each band
              // also gives it its own `role="progressbar"`, which the divs had no
              // way to express.
              return (
                <Progress
                  key={hourlyPauseResumeStats.hour}
                  size="lg"
                  label={`${hourlyPauseResumeStats.hour}:00`}
                  valueText={`⏸ ${pauseCount} / ▶ ${resumeCount}`}
                  segments={[
                    { value: pauseBarWidth, tone: 'danger', label: 'Pauses' },
                    { value: resumeBarWidth, tone: 'primary', label: 'Resumes' },
                  ]}
                />
              );
            }
          )}
        </div>
      </StatsSection>
    </div>
  );
}
