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

interface TopQuery {
  query: string
  query_type: string
  count: string
  avg_results: string
  avg_selected_position: string
}

interface QueryType {
  query_type: string
  count: string
  avg_results: string
  selections: string
}

interface ZeroResult {
  query: string
  count: string
}

interface SearchStatsData {
  topQueries: TopQuery[]
  queryTypes: QueryType[]
  zeroResults: ZeroResult[]
}

export default function SearchStats() {
  const { data, isLoading, error } = useQuery<SearchStatsData>({
    queryKey: ['stats', 'search'],
    queryFn: () => statsApi.search().then((r) => r.data),
    refetchInterval: 10000,
  })

  if (isLoading) return <div className="stats-loading text-center py-12">Loading search analytics...</div>
  if (error) return <div className="stats-error text-center py-12">Error loading search analytics</div>
  if (!data) return null

  const queryTypesData = {
    labels: data.queryTypes.map((qt) => qt.query_type || 'Unknown'),
    datasets: [
      {
        data: data.queryTypes.map((qt) => parseInt(qt.count)),
        backgroundColor: [
          'rgba(59, 130, 246, 0.7)',
          'rgba(34, 197, 94, 0.7)',
          'rgba(251, 146, 60, 0.7)',
          'rgba(168, 85, 247, 0.7)',
          'rgba(236, 72, 153, 0.7)',
        ],
        borderColor: [
          'rgba(59, 130, 246, 1)',
          'rgba(34, 197, 94, 1)',
          'rgba(251, 146, 60, 1)',
          'rgba(168, 85, 247, 1)',
          'rgba(236, 72, 153, 1)',
        ],
        borderWidth: 1,
      },
    ],
  }

  const topQueriesData = {
    labels: data.topQueries.slice(0, 10).map((q) => q.query.substring(0, 30)),
    datasets: [
      {
        label: 'Search Count',
        data: data.topQueries.slice(0, 10).map((q) => parseInt(q.count)),
        backgroundColor: 'rgba(168, 85, 247, 0.6)',
        borderColor: 'rgba(168, 85, 247, 1)',
        borderWidth: 1,
      },
    ],
  }

  return (
    <div className="space-y-6">
      {/* Query Types Distribution */}
      {data.queryTypes.length > 0 && (
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
          <h3 className="text-xl text-white mb-4">Query Types Distribution</h3>
          <div className="max-h-[400px]">
            <Doughnut
              data={queryTypesData}
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

      {/* Top Queries Chart */}
      {data.topQueries.length > 0 && (
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
          <h3 className="text-xl text-white mb-4">Most Popular Searches</h3>
          <div className="max-h-[400px]">
            <Bar
              data={topQueriesData}
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

      {/* Top Queries Table */}
      {data.topQueries.length > 0 && (
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
          <h3 className="text-xl text-white mb-4">Top Search Queries</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-gray-400 border-b border-gray-700">
                  <th className="pb-2 px-4">Query</th>
                  <th className="pb-2 px-4">Type</th>
                  <th className="pb-2 px-4">Count</th>
                  <th className="pb-2 px-4">Avg Results</th>
                  <th className="pb-2 px-4">Avg Position</th>
                </tr>
              </thead>
              <tbody>
                {data.topQueries.map((query, idx) => (
                  <tr key={idx} className="border-b border-gray-700/50 text-gray-300">
                    <td className="py-2 px-4 font-mono text-sm">{query.query}</td>
                    <td className="py-2 px-4">
                      <span className="px-2 py-1 rounded text-xs bg-gray-700">
                        {query.query_type}
                      </span>
                    </td>
                    <td className="py-2 px-4">{query.count}</td>
                    <td className="py-2 px-4">{query.avg_results}</td>
                    <td className="py-2 px-4">{query.avg_selected_position || 'N/A'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Query Types Details */}
      {data.queryTypes.length > 0 && (
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
          <h3 className="text-xl text-white mb-4">Query Types Breakdown</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-gray-400 border-b border-gray-700">
                  <th className="pb-2 px-4">Type</th>
                  <th className="pb-2 px-4">Count</th>
                  <th className="pb-2 px-4">Avg Results</th>
                  <th className="pb-2 px-4">Selections</th>
                </tr>
              </thead>
              <tbody>
                {data.queryTypes.map((type, idx) => (
                  <tr key={idx} className="border-b border-gray-700/50 text-gray-300">
                    <td className="py-2 px-4">{type.query_type}</td>
                    <td className="py-2 px-4">{type.count}</td>
                    <td className="py-2 px-4">{type.avg_results}</td>
                    <td className="py-2 px-4">{type.selections}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Zero Results Queries */}
      {data.zeroResults.length > 0 && (
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
          <h3 className="text-xl text-white mb-4">Queries with No Results</h3>
          <div className="text-sm text-gray-400 mb-4">
            These queries returned zero results - opportunities to improve search or content
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-gray-400 border-b border-gray-700">
                  <th className="pb-2 px-4">Query</th>
                  <th className="pb-2 px-4">Attempts</th>
                </tr>
              </thead>
              <tbody>
                {data.zeroResults.map((query, idx) => (
                  <tr key={idx} className="border-b border-gray-700/50 text-gray-300">
                    <td className="py-2 px-4 font-mono text-sm">{query.query}</td>
                    <td className="py-2 px-4 text-yellow-400">{query.count}</td>
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
