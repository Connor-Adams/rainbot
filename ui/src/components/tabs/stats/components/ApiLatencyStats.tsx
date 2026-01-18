import { useQuery } from '@tanstack/react-query'
import { statsApi } from '@/lib/api'
import { EmptyState } from '@/components/common'
import { safeInt } from '@/lib/chartSafety'
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
} from 'recharts'

interface OverallStats {
  total_requests: string
  avg_latency_ms: string
  p50_ms: string
  p95_ms: string
  p99_ms: string
  max_ms: string
}

interface EndpointStats {
  endpoint: string
  request_count: string
  avg_latency_ms: string
  p95_ms: string
}

interface StatusCode {
  status_code: string
  count: string
}

interface ApiLatencyData {
  overall: OverallStats
  byEndpoint: EndpointStats[]
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

  if (!data || !data.overall) {
    return <EmptyState icon="⚡" message="No API latency data available yet" submessage="API latency statistics will appear here as the dashboard makes requests" />
  }

  const overall = data.overall
  const byEndpoint = Array.isArray(data.byEndpoint) ? data.byEndpoint : []
  const statusCodes = Array.isArray(data.statusCodes) ? data.statusCodes : []

  const endpointData = byEndpoint.slice(0, 10).map((e) => ({
    name: (e.endpoint || 'Unknown').substring(0, 20),
    value: safeInt(e.avg_latency_ms),
  }))

  const statusData = statusCodes.map((s) => ({
    name: s.status_code || 'Unknown',
    value: safeInt(s.count),
    color: s.status_code?.startsWith('2') ? 'rgb(34, 197, 94)' : s.status_code?.startsWith('4') ? 'rgb(251, 146, 60)' : 'rgb(239, 68, 68)',
  })).filter(d => d.value > 0)

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <div className="bg-surface border border-border rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-primary-light">{overall.total_requests || 0}</div>
          <div className="text-sm text-text-secondary">Total Requests</div>
        </div>
        <div className="bg-surface border border-border rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-success-light">{overall.avg_latency_ms || 0}ms</div>
          <div className="text-sm text-text-secondary">Avg Latency</div>
        </div>
        <div className="bg-surface border border-border rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-secondary-light">{overall.p50_ms || 0}ms</div>
          <div className="text-sm text-text-secondary">P50</div>
        </div>
        <div className="bg-surface border border-border rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-warning-light">{overall.p95_ms || 0}ms</div>
          <div className="text-sm text-text-secondary">P95</div>
        </div>
        <div className="bg-surface border border-border rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-warning">{overall.p99_ms || 0}ms</div>
          <div className="text-sm text-text-secondary">P99</div>
        </div>
        <div className="bg-surface border border-border rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-danger-light">{overall.max_ms || 0}ms</div>
          <div className="text-sm text-text-secondary">Max</div>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {endpointData.length > 0 && (
          <div className="bg-surface border border-border rounded-xl p-6">
            <h3 className="text-lg text-text-primary mb-4">Avg Latency by Endpoint (ms)</h3>
            <div style={{ width: '100%', height: Math.max(200, endpointData.length * 32) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={endpointData} layout="vertical" margin={{ left: 80, right: 20 }}>
                  <XAxis type="number" tick={{ fill: '#9ca3af', fontSize: 12 }} />
                  <YAxis type="category" dataKey="name" tick={{ fill: '#9ca3af', fontSize: 12 }} width={75} />
                  <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: 8 }} />
                  <Bar dataKey="value" fill="rgb(59, 130, 246)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
        
        {statusData.length > 0 && (
          <div className="bg-surface border border-border rounded-xl p-6">
            <h3 className="text-lg text-text-primary mb-4">Status Codes</h3>
            <div style={{ width: '100%', height: 280 }}>
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
                    label={({ name, percent }: { name: string; percent: number }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                    labelLine={{ stroke: '#6b7280' }}
                  >
                    {statusData.map((entry, index) => (
                      <Cell key={index} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: 8 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
