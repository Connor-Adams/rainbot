import { useQuery } from '@tanstack/react-query'
import { statsApi } from '@/lib/api'
import { Bar, Doughnut } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  ArcElement,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js'

ChartJS.register(ArcElement, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend)

interface OverallStats {
  total_requests: string
  avg_latency_ms: string
  p50_ms: string
  p95_ms: string
  p99_ms: string
  max_ms: string
}

interface EndpointStat {
  endpoint: string
  method: string
  requests: string
  avg_latency_ms: string
  p95_ms: string
}

interface StatusCode {
  status_code: string
  count: string
}

interface ApiLatencyData {
  overall: OverallStats
  byEndpoint: EndpointStat[]
  statusCodes: StatusCode[]
}

export default function ApiLatencyStats() {
  const { data, isLoading, error } = useQuery<ApiLatencyData>({
    queryKey: ['stats', 'api-latency'],
    queryFn: () => statsApi.apiLatency().then((r) => r.data),
    refetchInterval: 10000,
  })

  if (isLoading) return <div className="stats-loading text-center py-12">Loading API latency...</div>
  if (error) return <div className="stats-error text-center py-12">Error loading API latency</div>
  if (!data) return null

  const statusCodesData = {
    labels: data.statusCodes.map((s) => `${s.status_code}`),
    datasets: [
      {
        data: data.statusCodes.map((s) => parseInt(s.count)),
        backgroundColor: data.statusCodes.map((s) => {
          const code = parseInt(s.status_code)
          if (code >= 200 && code < 300) return 'rgba(34, 197, 94, 0.7)'
          if (code >= 300 && code < 400) return 'rgba(59, 130, 246, 0.7)'
          if (code >= 400 && code < 500) return 'rgba(251, 146, 60, 0.7)'
          return 'rgba(239, 68, 68, 0.7)'
        }),
        borderColor: data.statusCodes.map((s) => {
          const code = parseInt(s.status_code)
          if (code >= 200 && code < 300) return 'rgba(34, 197, 94, 1)'
          if (code >= 300 && code < 400) return 'rgba(59, 130, 246, 1)'
          if (code >= 400 && code < 500) return 'rgba(251, 146, 60, 1)'
          return 'rgba(239, 68, 68, 1)'
        }),
        borderWidth: 1,
      },
    ],
  }

  const endpointLatencyData = {
    labels: data.byEndpoint.slice(0, 10).map((e) => `${e.method} ${e.endpoint}`.substring(0, 40)),
    datasets: [
      {
        label: 'P95 Latency (ms)',
        data: data.byEndpoint.slice(0, 10).map((e) => parseFloat(e.p95_ms)),
        backgroundColor: 'rgba(59, 130, 246, 0.6)',
        borderColor: 'rgba(59, 130, 246, 1)',
        borderWidth: 1,
      },
    ],
  }

  return (
    <div className="space-y-6">
      {/* Overall Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-blue-400">{data.overall.total_requests}</div>
          <div className="text-sm text-gray-400">Total Requests</div>
        </div>
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-green-400">{data.overall.avg_latency_ms}ms</div>
          <div className="text-sm text-gray-400">Avg Latency</div>
        </div>
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-purple-400">{data.overall.p50_ms}ms</div>
          <div className="text-sm text-gray-400">P50 (Median)</div>
        </div>
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-yellow-400">{data.overall.p95_ms}ms</div>
          <div className="text-sm text-gray-400">P95</div>
        </div>
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-orange-400">{data.overall.p99_ms}ms</div>
          <div className="text-sm text-gray-400">P99</div>
        </div>
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-red-400">{data.overall.max_ms}ms</div>
          <div className="text-sm text-gray-400">Max</div>
        </div>
      </div>

      {/* Status Codes */}
      {data.statusCodes.length > 0 && (
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
          <h3 className="text-xl text-white mb-4">Status Code Distribution</h3>
          <div className="max-h-[400px]">
            <Doughnut
              data={statusCodesData}
              options={{
                responsive: true,
                plugins: {
                  legend: { labels: { color: '#9ca3af' } },
                },
              }}
            />
          </div>
        </div>
      )}

      {/* Endpoint Latency Chart */}
      {data.byEndpoint.length > 0 && (
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
          <h3 className="text-xl text-white mb-4">Slowest Endpoints (P95)</h3>
          <div className="max-h-[400px]">
            <Bar
              data={endpointLatencyData}
              options={{
                responsive: true,
                indexAxis: 'y',
                scales: { x: { beginAtZero: true } },
                plugins: { legend: { labels: { color: '#9ca3af' } } },
              }}
            />
          </div>
        </div>
      )}

      {/* Endpoint Details Table */}
      {data.byEndpoint.length > 0 && (
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
          <h3 className="text-xl text-white mb-4">Endpoint Performance Details</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-gray-400 border-b border-gray-700">
                  <th className="pb-2 px-4">Method</th>
                  <th className="pb-2 px-4">Endpoint</th>
                  <th className="pb-2 px-4">Requests</th>
                  <th className="pb-2 px-4">Avg</th>
                  <th className="pb-2 px-4">P95</th>
                </tr>
              </thead>
              <tbody>
                {data.byEndpoint.map((endpoint, idx) => (
                  <tr key={idx} className="border-b border-gray-700/50 text-gray-300">
                    <td className="py-2 px-4">
                      <span className="px-2 py-1 rounded text-xs bg-gray-700 font-mono">
                        {endpoint.method}
                      </span>
                    </td>
                    <td className="py-2 px-4 font-mono text-sm">{endpoint.endpoint}</td>
                    <td className="py-2 px-4">{endpoint.requests}</td>
                    <td className="py-2 px-4">{endpoint.avg_latency_ms}ms</td>
                    <td className="py-2 px-4">
                      <span
                        className={
                          parseFloat(endpoint.p95_ms) > 1000
                            ? 'text-red-400'
                            : parseFloat(endpoint.p95_ms) > 500
                              ? 'text-yellow-400'
                              : 'text-green-400'
                        }
                      >
                        {endpoint.p95_ms}ms
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
