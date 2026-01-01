import { Bar, Doughnut } from 'react-chartjs-2'
import '@/lib/chartSetup' // Centralized Chart.js registration
import { StatsLoading, StatsError, ChartContainer, StatsSection, StatsTable } from '@/components/common'
import { useStatsQuery } from '@/hooks/useStatsQuery'
import { statsApi } from '@/lib/api'

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
  const { data, isLoading, error } = useStatsQuery<SearchStatsData>({
    queryKey: ['stats', 'search'],
    queryFn: () => statsApi.search(),
    refetchInterval: 10000,
  })

  if (isLoading) return <StatsLoading message="Loading search analytics..." />
  if (error) return <StatsError error={error} message="Error loading search analytics" />
  if (!data) return null

  const queryTypesData = {
    labels: (data.queryTypes || []).map((qt) => qt.query_type || 'Unknown'),
    datasets: [
      {
        data: (data.queryTypes || []).map((qt) => parseInt(qt.count)),
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
    labels: (data.topQueries || []).slice(0, 10).map((q) => q.query.substring(0, 30)),
    datasets: [
      {
        label: 'Search Count',
        data: (data.topQueries || []).slice(0, 10).map((q) => parseInt(q.count)),
        backgroundColor: 'rgba(168, 85, 247, 0.6)',
        borderColor: 'rgba(168, 85, 247, 1)',
        borderWidth: 1,
      },
    ],
  }

  const topQueriesColumns = [
    { id: 'query', header: 'Query', key: 'query', className: 'px-4 py-2 font-mono text-sm' },
    {
      id: 'type',
      header: 'Type',
      render: (query: TopQuery) => (
        <span className="px-2 py-1 rounded text-xs bg-gray-700">{query.query_type}</span>
      ),
      className: 'px-4 py-2',
    },
    { id: 'count', header: 'Count', key: 'count', className: 'px-4 py-2' },
    { id: 'avg_results', header: 'Avg Results', key: 'avg_results', className: 'px-4 py-2' },
    {
      id: 'avg_position',
      header: 'Avg Position',
      render: (query: TopQuery) => query.avg_selected_position || 'N/A',
      className: 'px-4 py-2',
    },
  ]

  const queryTypesColumns = [
    { id: 'type', header: 'Type', key: 'query_type', className: 'px-4 py-2' },
    { id: 'count', header: 'Count', key: 'count', className: 'px-4 py-2' },
    { id: 'avg_results', header: 'Avg Results', key: 'avg_results', className: 'px-4 py-2' },
    { id: 'selections', header: 'Selections', key: 'selections', className: 'px-4 py-2' },
  ]

  const zeroResultsColumns = [
    { id: 'query', header: 'Query', key: 'query', className: 'px-4 py-2 font-mono text-sm' },
    {
      id: 'attempts',
      header: 'Attempts',
      render: (query: ZeroResult) => <span className="text-yellow-400">{query.count}</span>,
      className: 'px-4 py-2',
    },
  ]

  return (
    <div className="space-y-6">
      {(data.queryTypes || []).length > 0 && (
        <ChartContainer title="Query Types Distribution">
          <Doughnut
            data={queryTypesData}
            options={{
              responsive: true,
              plugins: { legend: { labels: { color: '#9ca3af' } } },
            }}
          />
        </ChartContainer>
      )}

      {(data.topQueries || []).length > 0 && (
        <ChartContainer title="Most Popular Searches">
          <Bar
            data={topQueriesData}
            options={{
              responsive: true,
              indexAxis: 'y',
              scales: { x: { beginAtZero: true } },
              plugins: { legend: { labels: { color: '#9ca3af' } } },
            }}
          />
        </ChartContainer>
      )}

      {(data.topQueries || []).length > 0 && (
        <StatsSection title="Top Search Queries">
          <StatsTable
            columns={topQueriesColumns}
            data={data.topQueries}
            getRowKey={(query: TopQuery, idx: number) => `${query.query}-${query.query_type}-${idx}`}
          />
        </StatsSection>
      )}

      {(data.queryTypes || []).length > 0 && (
        <StatsSection title="Query Types Breakdown">
          <StatsTable
            columns={queryTypesColumns}
            data={data.queryTypes}
            getRowKey={(type: QueryType) => type.query_type}
          />
        </StatsSection>
      )}

      {(data.zeroResults || []).length > 0 && (
        <StatsSection title="Queries with No Results">
          <div className="text-sm text-gray-400 mb-4">
            These queries returned zero results - opportunities to improve search or content
          </div>
          <StatsTable
            columns={zeroResultsColumns}
            data={data.zeroResults}
            getRowKey={(query: ZeroResult, idx: number) => `${query.query}-${idx}`}
          />
        </StatsSection>
      )}
    </div>
  )
}
