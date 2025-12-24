import { useQuery } from '@tanstack/react-query'
import { statsApi } from '@/lib/api'
import type { StatsSummary as StatsSummaryType } from '@/types'
import { StatsLoading, StatsError, StatCard } from '@/components/common'

export default function StatsSummary() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['stats', 'summary'],
    queryFn: () => statsApi.summary().then((res) => res.data as StatsSummaryType),
    refetchInterval: 30000,
  })

  if (isLoading) return <StatsLoading />
  if (error) return <StatsError error={error} message="Error loading statistics" />
  if (!data) return null

  return (
    <div className="stats-summary space-y-6">
      <div className="stats-cards grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-6">
        <StatCard value={data.totalCommands} label="Total Commands" />
        <StatCard value={data.totalSounds} label="Sounds Played" />
        <StatCard value={data.uniqueUsers} label="Active Users" />
        <StatCard value={data.uniqueGuilds} label="Active Guilds" />
        <StatCard value={`${data.successRate.toFixed(1)}%`} label="Success Rate" />
      </div>
    </div>
  )
}

