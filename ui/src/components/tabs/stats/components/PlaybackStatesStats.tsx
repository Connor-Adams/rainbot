import { useQuery } from '@tanstack/react-query'
import { statsApi } from '@/lib/api'

type PlaybackState = {
  state_type: string
  count: string
}

type VolumeDistributionEntry = {
  volume_level: number
  count: string
}

type PausePatternByHourEntry = {
  hour: string
  pauses: string
  resumes: string
}

type PlaybackStatesResponse = {
  stateTypes: PlaybackState[]
  volumeDistribution: VolumeDistributionEntry[]
  pausePatternByHour: PausePatternByHourEntry[]
}

export default function PlaybackStatesStats() {
  const { data, isLoading, error } = useQuery<PlaybackStatesResponse>({
    queryKey: ['stats', 'playback-states'],
    queryFn: () => statsApi.playbackStates().then((r) => r.data),
    refetchInterval: 10000,
  })

  if (isLoading) return <div className="py-12 text-center">Loading…</div>
  if (error) return <div className="py-12 text-center text-red-400">Error</div>
  if (!data) return null

  return (
    <div className="space-y-8">
      {/* Playback state counts */}
      <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
        <h3 className="text-white text-lg mb-4">Playback State Changes</h3>

        {data.stateTypes.map((playbackState: PlaybackState) => {
          const playbackStateCount = Number(playbackState.count)
          const maxPlaybackStateCount = Math.max(
            ...data.stateTypes.map((stateEntry: PlaybackState) => Number(stateEntry.count))
          )
          const playbackStateBarWidth =
            (playbackStateCount / maxPlaybackStateCount) * 100

          return (
            <div key={playbackState.state_type} className="mb-3">
              <div className="flex justify-between text-sm text-gray-300 mb-1">
                <span className="capitalize">{playbackState.state_type}</span>
                <span>{playbackStateCount}</span>
              </div>

              <div className="w-full h-3 bg-gray-700 rounded">
                <div
                  className="h-3 bg-blue-500 rounded"
                  style={{ width: `${playbackStateBarWidth}%` }}
                />
              </div>
            </div>
          )
        })}
      </div>

      {/* Volume distribution */}
      <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
        <h3 className="text-white text-lg mb-4">Volume Levels</h3>

        {data.volumeDistribution.map((volumeEntry: VolumeDistributionEntry) => {
          const volumeLevelCount = Number(volumeEntry.count)
          const maxVolumeLevelCount = Math.max(
            ...data.volumeDistribution.map(
              (volumeLevelEntry: VolumeDistributionEntry) => Number(volumeLevelEntry.count)
            )
          )
          const volumeLevelBarWidth =
            (volumeLevelCount / maxVolumeLevelCount) * 100

          return (
            <div key={volumeEntry.volume_level} className="mb-3">
              <div className="flex justify-between text-sm text-gray-300 mb-1">
                <span>Volume {volumeEntry.volume_level}</span>
                <span>{volumeLevelCount}</span>
              </div>

              <div className="w-full h-3 bg-gray-700 rounded">
                <div
                  className="h-3 bg-emerald-500 rounded"
                  style={{ width: `${volumeLevelBarWidth}%` }}
                />
              </div>
            </div>
          )
        })}
      </div>

      {/* Pause / resume by hour */}
      <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
        <h3 className="text-white text-lg mb-4">Pauses & Resumes by Hour</h3>

        {data.pausePatternByHour.map(
          (hourlyPauseResumeStats: PausePatternByHourEntry) => {
            const pauseCount = Number(hourlyPauseResumeStats.pauses)
            const resumeCount = Number(hourlyPauseResumeStats.resumes)
            const totalPauseResumeCount = pauseCount + resumeCount

            const pauseBarWidth =
              totalPauseResumeCount === 0
                ? 0
                : (pauseCount / totalPauseResumeCount) * 100

            const resumeBarWidth =
              totalPauseResumeCount === 0
                ? 0
                : (resumeCount / totalPauseResumeCount) * 100

            return (
              <div key={hourlyPauseResumeStats.hour} className="mb-4">
                <div className="flex justify-between text-sm text-gray-300 mb-1">
                  <span>{hourlyPauseResumeStats.hour}:00</span>
                  <span>
                    ⏸ {pauseCount} / ▶ {resumeCount}
                  </span>
                </div>

                <div className="w-full h-3 bg-gray-700 rounded flex overflow-hidden">
                  <div
                    className="h-3 bg-red-400"
                    style={{ width: `${pauseBarWidth}%` }}
                  />
                  <div
                    className="h-3 bg-blue-400"
                    style={{ width: `${resumeBarWidth}%` }}
                  />
                </div>
              </div>
            )
          }
        )}
      </div>
    </div>
  )
}
