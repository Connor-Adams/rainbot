import {
  StatsLoading,
  StatsError,
  StatsSection,
  StatsTable,
  ChartContainer,
  EmptyState,
  chartTheme,
  chartColor,
} from '@/components/common';
import { useStatsQuery } from '@/hooks/useStatsQuery';
import { statsApi } from '@/lib/api';
import { safeInt } from '@/lib/chartSafety';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { pieSliceLabel } from './pieLabel';

interface TopQuery {
  query: string;
  query_type: string;
  count: string;
  avg_results: string;
  avg_selected_position: string;
}

interface QueryType {
  query_type: string;
  count: string;
  avg_results: string;
}

interface ZeroResult {
  query: string;
  query_type: string;
  count: string;
}

interface SearchData {
  topQueries: TopQuery[];
  queryTypes: QueryType[];
  zeroResults: ZeroResult[];
}

export default function SearchStats() {
  const { data, isLoading, error } = useStatsQuery<SearchData>({
    queryKey: ['stats', 'search'],
    queryFn: () => statsApi.search(),
  });

  if (isLoading) return <StatsLoading message="Loading search statistics..." />;
  if (error) return <StatsError error={error} />;

  const topQueries = Array.isArray(data?.topQueries) ? data.topQueries : [];
  const queryTypes = Array.isArray(data?.queryTypes) ? data.queryTypes : [];
  const zeroResults = Array.isArray(data?.zeroResults) ? data.zeroResults : [];

  if (!data || topQueries.length === 0) {
    return (
      <EmptyState
        icon="🔍"
        message="No search data available yet"
        submessage="Search statistics will appear as users search for content"
      />
    );
  }

  const queryData = topQueries.slice(0, 10).map((q) => ({
    name: (q.query || 'Unknown').substring(0, 20),
    value: safeInt(q.count),
  }));

  const typeData = queryTypes
    .map((t, idx) => ({
      name: t.query_type || 'Unknown',
      value: safeInt(t.count),
      color: chartColor(idx),
    }))
    .filter((d) => d.value > 0);

  const columns = [
    {
      id: 'query',
      header: 'Query',
      render: (q: TopQuery) => q.query,
      className: 'text-sm text-text-primary',
    },
    {
      id: 'type',
      header: 'Type',
      render: (q: TopQuery) => (
        <span className="px-2 py-1 bg-surface-hover rounded text-xs">{q.query_type}</span>
      ),
      className: 'text-sm',
    },
    {
      id: 'count',
      header: 'Count',
      render: (q: TopQuery) => q.count,
      className: 'text-sm text-text-secondary',
    },
    {
      id: 'avg_results',
      header: 'Avg Results',
      render: (q: TopQuery) => q.avg_results,
      className: 'text-sm text-text-secondary',
    },
  ];

  const zeroResultColumns = [
    { id: 'query', header: 'Query', render: (z: ZeroResult) => z.query },
    {
      id: 'type',
      header: 'Type',
      render: (z: ZeroResult) => (
        <span className="px-2 py-1 bg-surface-hover rounded text-xs">{z.query_type}</span>
      ),
    },
    { id: 'count', header: 'Count', render: (z: ZeroResult) => z.count },
  ];

  return (
    <div className="space-y-6">
      <div className="grid md:grid-cols-2 gap-6">
        {queryData.length > 0 && (
          <ChartContainer title="Top Searches" height="auto" rowCount={queryData.length}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={queryData} layout="vertical" margin={{ left: 80, right: 20 }}>
                <XAxis type="number" tick={chartTheme.axis.tick} stroke={chartTheme.axis.stroke} />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={chartTheme.axis.tick}
                  stroke={chartTheme.axis.stroke}
                  width={75}
                />
                <Tooltip contentStyle={chartTheme.tooltip.contentStyle} />
                <Bar dataKey="value" fill={chartColor(0)} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartContainer>
        )}

        {typeData.length > 0 && (
          <ChartContainer title="Search Types" height={280}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={typeData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={2}
                  label={pieSliceLabel}
                  labelLine={{ stroke: chartTheme.tooltip.labelLine }}
                >
                  {typeData.map((entry, index) => (
                    <Cell key={index} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip contentStyle={chartTheme.tooltip.contentStyle} />
              </PieChart>
            </ResponsiveContainer>
          </ChartContainer>
        )}
      </div>

      <StatsSection title="Search Details">
        <StatsTable
          columns={columns}
          data={topQueries.slice(0, 20)}
          emptyMessage="No search data"
          getRowKey={(q: TopQuery) => q.query}
        />
      </StatsSection>

      {zeroResults.length > 0 && (
        <StatsSection title="Zero Result Searches">
          <StatsTable
            columns={zeroResultColumns}
            data={zeroResults.slice(0, 10)}
            emptyMessage="No zero result searches"
            getRowKey={(z: ZeroResult) => z.query}
          />
        </StatsSection>
      )}
    </div>
  );
}
