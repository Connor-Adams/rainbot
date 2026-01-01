import { useQuery } from '@tanstack/react-query'
import { statsApi } from '@/lib/api'
import { Bar } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js'
import type { QueueOperation } from '@/types'

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend)

export default function QueueStats() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['stats', 'queue'],
    queryFn: () => statsApi.queue().then((res) => res.data),
    refetchInterval: 30000,
  })

  if (isLoading) {
    return <div className="text-center py-12 text-text-secondary">Loading queue statistics...</div>
  }

  if (error) {
    return (
      <div className="text-center py-12 text-danger">
        Error: {error instanceof Error ? error.message : 'Unknown error'}
      </div>
    )
  }

  if (!data) return null

  const barData = {
    labels: (data.operations || []).map((o: QueueOperation) => o.operation_type),
    datasets: [
      {
        label: 'Count',
        data: (data.operations || []).map((o: QueueOperation) => parseInt(o.count)),
        backgroundColor: 'rgba(251, 146, 60, 0.5)',
        borderColor: 'rgba(251, 146, 60, 1)',
        borderWidth: 1,
      },
    ],
  }

  return (
    <div className="bg-surface border border-border rounded-xl p-6">
      <h3 className="text-xl text-text-primary mb-4">Queue Operations</h3>
      <div className="max-h-[400px]">
        <Bar data={barData} options={{ responsive: true, scales: { y: { beginAtZero: true } } }} />
      </div>
    </div>
  )
}

