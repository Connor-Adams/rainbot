import { statsApi } from '@/lib/api';
import { useStatsQuery } from '@/hooks/useStatsQuery';
import { StatsLoading, StatsError, StatsSection } from '@/components/common';
import { Progress } from '@connor-adams/designsystem';

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

  return (
    <div className="space-y-8">
      {/* Playback state counts */}
      <StatsSection title="Playback State Changes">
        <div className="space-y-3">
          {(data.stateTypes || []).map((playbackState: PlaybackState) => {
            const playbackStateCount = Number(playbackState.count);
            const maxPlaybackStateCount = Math.max(
              ...(data.stateTypes || []).map((stateEntry: PlaybackState) =>
                Number(stateEntry.count)
              )
            );
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
            const volumeLevelCount = Number(volumeEntry.count);
            const maxVolumeLevelCount = Math.max(
              ...(data.volumeDistribution || []).map((volumeLevelEntry: VolumeDistributionEntry) =>
                Number(volumeLevelEntry.count)
              )
            );
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
              const pauseCount = Number(hourlyPauseResumeStats.pauses);
              const resumeCount = Number(hourlyPauseResumeStats.resumes);
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
