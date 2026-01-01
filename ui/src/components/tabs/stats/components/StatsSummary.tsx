import type { StatsSummary as StatsSummaryType } from '@/types'
import { StatsLoading, StatsError, StatCard } from '@/components/common'
import { useStatsQuery } from '@/hooks/useStatsQuery'
import { statsApi } from '@/lib/api'

export default function StatsSummary() {
  const { data, isLoading, error } = useStatsQuery<StatsSummaryType>({
    queryKey: ['stats', 'summary'],
    queryFn: () => statsApi.summary(),
  })

  if (isLoading) return <StatsLoading />
  if (error) return <StatsError error={error} message="Error loading statistics" />
  if (!data) return null

  const successRate = typeof data.successRate === 'number' && !isNaN(data.successRate)
    ? data.successRate.toFixed(1)
    : '0.0'

  return (
    <div className="stats-summary space-y-6">
      <div className="stats-cards grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-6">
        <StatCard value={data.totalCommands} label="Total Commands" />
        <StatCard value={data.totalSounds} label="Sounds Played" />
        <StatCard value={data.uniqueUsers} label="Active Users" />
        <StatCard value={data.uniqueGuilds} label="Active Guilds" />
        <StatCard value={`${successRate}%`} label="Success Rate" />
      </div>
    </div>
  )
}

