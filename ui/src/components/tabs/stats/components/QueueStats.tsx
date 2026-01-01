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

// Safe number parser - returns 0 for any invalid value
function safeInt(val: unknown): number {
  if (val === null || val === undefined) return 0
  const num = typeof val === 'number' ? val : parseInt(String(val), 10)
  if (!Number.isFinite(num)) return 0
  return num
}

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

  // Safe data access with defaults
  const operations = Array.isArray(data?.operations) ? data.operations : []
  
  if (!data || operations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-8 px-6 text-center">
        <span className="text-3xl opacity-50">📋</span>
        <p className="text-sm text-gray-400">No queue data available yet</p>
        <small className="text-xs text-gray-500">Queue statistics will appear as users add and manage songs</small>
      </div>
    )
  }

  // Prepare chart data with strict validation
  const validOps = operations.slice(0, 20).filter((o: QueueOperation): o is QueueOperation => 
    o && typeof o.operation_type === 'string' && o.operation_type.length > 0
  )
  
  const labels = validOps.map((o: QueueOperation) => o.operation_type)
  const dataValues = validOps.map((o: QueueOperation) => safeInt(o.count))
  
  // Only render chart if we have valid data
  const canRenderChart = labels.length > 0 && dataValues.length > 0 && dataValues.every(Number.isFinite)

  const barData = {
    labels,
    datasets: [
      {
        label: 'Count',
        data: dataValues,
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

