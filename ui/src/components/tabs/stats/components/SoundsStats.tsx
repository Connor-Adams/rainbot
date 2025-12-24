import { useQuery } from '@tanstack/react-query'
import { statsApi } from '@/lib/api'
import { Bar, Pie, Doughnut } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js'
import type { SoundStat, SourceType, SoundboardBreakdown } from '@/types'

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Title, Tooltip, Legend)

export default function SoundsStats() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['stats', 'sounds'],
    queryFn: () => statsApi.sounds().then((res) => res.data),
    refetchInterval: 30000,
  })

  if (isLoading) {
    return <div className="stats-loading text-center py-12 text-gray-400">Loading sound statistics...</div>
  }

  if (error) {
    return (
      <div className="stats-error text-center py-12 text-red-400">
        Error: {error instanceof Error ? error.message : 'Unknown error'}
      </div>
    )
  }

  if (!data) return null

  const top10 = (data.sounds || []).slice(0, 10)

  const soundsBarData = {
    labels: top10.map((s: SoundStat) =>
      s.sound_name.length > 30 ? s.sound_name.substring(0, 30) + '...' : s.sound_name
    ),
    datasets: [
      {
        label: 'Play Count',
        data: top10.map((s: SoundStat) => parseInt(s.count)),
        backgroundColor: 'rgba(139, 92, 246, 0.5)',
        borderColor: 'rgba(139, 92, 246, 1)',
        borderWidth: 1,
      },
    ],
  }

  const sourcePieData = {
    labels: (data.sourceTypes || []).map((s: SourceType) => s.source_type),
    datasets: [
      {
        data: (data.sourceTypes || []).map((s: SourceType) => parseInt(s.count)),
        backgroundColor: [
          'rgba(59, 130, 246, 0.5)',
          'rgba(239, 68, 68, 0.5)',
          'rgba(34, 197, 94, 0.5)',
          'rgba(251, 146, 60, 0.5)',
          'rgba(168, 85, 247, 0.5)',
        ],
      },
    ],
  }

  const soundboardDoughnutData = {
    labels: (data.soundboardBreakdown || []).map((b: SoundboardBreakdown) =>
      b.is_soundboard ? 'Soundboard' : 'Regular'
    ),
    datasets: [
      {
        data: (data.soundboardBreakdown || []).map((b: SoundboardBreakdown) => parseInt(b.count)),
        backgroundColor: ['rgba(139, 92, 246, 0.5)', 'rgba(59, 130, 246, 0.5)'],
      },
    ],
  }

  return (
    <>
      <div className="stats-section bg-gray-800 border border-gray-700 rounded-xl p-6 mb-6">
        <h3 className="text-xl text-white mb-4">Top Sounds</h3>
        <div className="max-h-[400px]">
          <Bar data={soundsBarData} options={{ responsive: true, scales: { y: { beginAtZero: true } } }} />
        </div>
      </div>
      <div className="stats-section bg-gray-800 border border-gray-700 rounded-xl p-6 mb-6">
        <h3 className="text-xl text-white mb-4">Source Type Breakdown</h3>
        <div className="max-h-[400px]">
          <Pie data={sourcePieData} options={{ responsive: true }} />
        </div>
      </div>
      <div className="stats-section bg-gray-800 border border-gray-700 rounded-xl p-6">
        <h3 className="text-xl text-white mb-4">Soundboard vs Regular</h3>
        <div className="max-h-[400px]">
          <Doughnut data={soundboardDoughnutData} options={{ responsive: true }} />
        </div>
      </div>
    </>
  )
}

