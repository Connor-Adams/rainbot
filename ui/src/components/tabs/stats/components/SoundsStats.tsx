import { useQuery } from '@tanstack/react-query'
import { statsApi } from '@/lib/api'
import { Bar, Pie, Doughnut } from 'react-chartjs-2'
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, ArcElement, Title, Tooltip, Legend } from 'chart.js'
import type { SoundStat, SourceType, SoundboardBreakdown } from '@/types'
import { safeInt, safeString } from '@/lib/chartSafety'

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Title, Tooltip, Legend)

export default function SoundsStats() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['stats', 'sounds'],
    queryFn: () => statsApi.sounds().then((res) => res.data),
    refetchInterval: 30000,
  })

  if (isLoading) {
    return <div className="stats-loading text-center py-12 text-text-secondary">Loading sound statistics...</div>
  }

  if (error) {
    return (
      <div className="stats-error text-center py-12 text-danger">
        Error: {error instanceof Error ? error.message : 'Unknown error'}
      </div>
    )
  }

  // Safe data access with defaults
  const sounds = Array.isArray(data?.sounds) ? data.sounds : []
  const sourceTypes = Array.isArray(data?.sourceTypes) ? data.sourceTypes : []
  const soundboardBreakdown = Array.isArray(data?.soundboardBreakdown) ? data.soundboardBreakdown : []
  
  if (!data || sounds.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-8 px-6 text-center">
        <span className="text-3xl opacity-50">🔊</span>
        <p className="text-sm text-text-secondary">No sound data available yet</p>
        <small className="text-xs text-text-muted">Sound statistics will appear as users play sounds</small>
      </div>
    )
  }

  const top10 = sounds.slice(0, 10)
  
  // Prepare safe chart data
  const barLabels = top10.map((s: SoundStat) => {
    const name = safeString(s.sound_name, 'Unknown')
    return name.length > 30 ? name.substring(0, 30) + '...' : name
  })
  const barValues = top10.map((s: SoundStat) => safeInt(s.count))
  const canRenderBar = barLabels.length > 0 && barValues.every(Number.isFinite)

  const soundsBarData = {
    labels: barLabels,
    datasets: [{
      label: 'Play Count',
      data: barValues,
      backgroundColor: 'rgba(139, 92, 246, 0.5)',
      borderColor: 'rgba(139, 92, 246, 1)',
      borderWidth: 1,
    }],
  }

  const sourcePieLabels = sourceTypes.map((s: SourceType) => safeString(s.source_type, 'Unknown'))
  const sourcePieValues = sourceTypes.map((s: SourceType) => safeInt(s.count))
  const canRenderPie = sourcePieLabels.length > 0 && sourcePieValues.every(Number.isFinite) && sourcePieValues.some((v: number) => v > 0)

  const sourcePieData = {
    labels: sourcePieLabels,
    datasets: [{
      data: sourcePieValues,
      backgroundColor: ['rgba(59, 130, 246, 0.5)', 'rgba(239, 68, 68, 0.5)', 'rgba(34, 197, 94, 0.5)', 'rgba(251, 146, 60, 0.5)', 'rgba(168, 85, 247, 0.5)'],
    }],
  }

  const sbLabels = soundboardBreakdown.map((b: SoundboardBreakdown) => b.is_soundboard ? 'Soundboard' : 'Regular')
  const sbValues = soundboardBreakdown.map((b: SoundboardBreakdown) => safeInt(b.count))
  const canRenderSb = sbLabels.length > 0 && sbValues.every(Number.isFinite) && sbValues.some((v: number) => v > 0)

  const soundboardDoughnutData = {
    labels: sbLabels,
    datasets: [{
      data: sbValues,
      backgroundColor: ['rgba(139, 92, 246, 0.5)', 'rgba(59, 130, 246, 0.5)'],
    }],
  }

  return (
    <>
      <div className="stats-section bg-surface border border-border rounded-xl p-6 mb-6">
        <h3 className="text-xl text-text-primary mb-4">Top Sounds</h3>
        <div className="max-h-[400px]">
          <Bar data={soundsBarData} options={{ responsive: true, scales: { y: { beginAtZero: true } } }} />
        </div>
      </div>
      <div className="stats-section bg-surface border border-border rounded-xl p-6 mb-6">
        <h3 className="text-xl text-text-primary mb-4">Source Type Breakdown</h3>
        <div className="max-h-[400px]">
          <Pie data={sourcePieData} options={{ responsive: true }} />
        </div>
      </div>
      <div className="stats-section bg-surface border border-border rounded-xl p-6">
        <h3 className="text-xl text-text-primary mb-4">Soundboard vs Regular</h3>
        <div className="max-h-[400px]">
          <Doughnut data={soundboardDoughnutData} options={{ responsive: true }} />
        </div>
      )}
    </div>
  )
}

