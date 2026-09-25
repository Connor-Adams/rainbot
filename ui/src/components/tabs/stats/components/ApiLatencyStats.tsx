import { statsApi } from '@/lib/api';
import { useStatsQuery } from '@/hooks/useStatsQuery';
import {
  EmptyState,
  StatsLoading,
  StatsError,
  StatCard,
  ChartContainer,
  chartColor,
  chartTheme,
} from '@/components/common';
import { StatGrid } from '@connor-adams/designsystem';
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

interface OverallStats {
  total_requests: string;
  avg_latency_ms: string;
  p50_ms: string;
  p95_ms: string;
  p99_ms: string;
  max_ms: string;
}

interface EndpointStats {
  endpoint: string;
  request_count: string;
  avg_latency_ms: string;
  p95_ms: string;
}

interface StatusCode {
  status_code: string;
  count: string;
}

interface ApiLatencyData {
  overall: OverallStats;
  byEndpoint: EndpointStats[];
  statusCodes: StatusCode[];
}

export default function ApiLatencyStats() {
  const { data, isLoading, error } = useStatsQuery<ApiLatencyData>({
    queryKey: ['stats', 'api-latency'],
    queryFn: ({ signal }) => statsApi.apiLatency({ signal }),
    refetchInterval: 10000,
  });

  if (isLoading) return <StatsLoading message="Loading API latency..." />;
  if (error) return <StatsError error={error} message="Error loading API latency" />;

  if (!data || !data.overall) {
    return (
      <EmptyState
        icon="⚡"
        message="No API latency data available yet"
        submessage="API latency statistics will appear here as the dashboard makes requests"
      />
    );
  }

  const overall = data.overall;
  const byEndpoint = Array.isArray(data.byEndpoint) ? data.byEndpoint : [];
  const statusCodes = Array.isArray(data.statusCodes) ? data.statusCodes : [];

  const endpointData = byEndpoint.slice(0, 10).map((e) => ({
    name: (e.endpoint || 'Unknown').substring(0, 20),
    value: safeInt(e.avg_latency_ms),
  }));

  // These slices used to encode the status CLASS in colour — green for 2xx,
  // orange for 4xx, red for 5xx. The chart palette has no ordered or status
  // ramp (`chartColors.domain.*` names money concepts only), so the series
  // moves to the neutral categorical ramp and the connotation is lost; the
  // slice labels still carry the status code. Colours are assigned before the
  // filter, so a zeroed slice never shifts the remaining slices' colours.
  const statusData = statusCodes
    .map((s, idx) => ({
      name: s.status_code || 'Unknown',
      value: safeInt(s.count),
      color: chartColor(idx),
    }))
    .filter((d) => d.value > 0);

  return (
    <div className="space-y-6">
      <StatGrid columns="auto" minItemWidth={160} gap="lg">
        <StatCard value={overall.total_requests || 0} label="Total Requests" />
        <StatCard value={`${overall.avg_latency_ms || 0}ms`} label="Avg Latency" />
        <StatCard value={`${overall.p50_ms || 0}ms`} label="P50" />
        <StatCard value={`${overall.p95_ms || 0}ms`} label="P95" />
        <StatCard value={`${overall.p99_ms || 0}ms`} label="P99" />
        <StatCard value={`${overall.max_ms || 0}ms`} label="Max" />
      </StatGrid>

      <div className="grid md:grid-cols-2 gap-6">
        {endpointData.length > 0 && (
          <ChartContainer
            title="Avg Latency by Endpoint (ms)"
            height="auto"
            rowCount={endpointData.length}
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={endpointData} layout="vertical" margin={{ left: 80, right: 20 }}>
                <XAxis type="number" tick={chartTheme.axis.tick} />
                <YAxis type="category" dataKey="name" tick={chartTheme.axis.tick} width={75} />
                <Tooltip contentStyle={chartTheme.tooltip.contentStyle} />
                <Bar dataKey="value" fill={chartColor(0)} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartContainer>
        )}

        {statusData.length > 0 && (
          <ChartContainer title="Status Codes" height={280}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={statusData}
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
                  {statusData.map((entry, index) => (
                    <Cell key={index} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip contentStyle={chartTheme.tooltip.contentStyle} />
              </PieChart>
            </ResponsiveContainer>
          </ChartContainer>
        )}
      </div>
    </div>
  );
}
