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
} from 'recharts'

interface PerformanceOverall {
  avg_ms: string
  p50_ms: string
  p95_ms: string
  p99_ms: string
  max_ms: string
  min_ms: string
  sample_count: string
}

interface CommandPerf {
  command_name: string
  avg_ms: string
  p95_ms: string
  execution_count: string
}

interface PerformanceData {
  overall: PerformanceOverall
  byCommand: CommandPerf[]
}

export default function PerformanceStats() {
  const { data, isLoading, error } = useQuery<PerformanceData>({
    queryKey: ['stats', 'performance'],
    queryFn: () => statsApi.performance().then((r) => r.data),
    refetchInterval: 30000,
  })

  if (isLoading) return <div className="stats-loading text-center py-12">Loading performance...</div>
  if (error) return <div className="stats-error text-center py-12">Error loading performance</div>

  if (!data) {
    return <EmptyState icon="⏱️" message="No performance data available yet" submessage="Performance statistics will appear here as commands are executed" />
  }

  const overall = data.overall || { avg_ms: '0', p50_ms: '0', p95_ms: '0', p99_ms: '0', max_ms: '0', min_ms: '0', sample_count: '0' }
  const byCommand = Array.isArray(data.byCommand) ? data.byCommand : []

  const commandData = byCommand.slice(0, 10).map((c) => ({
    name: c.command_name || 'Unknown',
    value: safeInt(c.avg_ms),
  }))

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-blue-400">{overall.sample_count || 0}</div>
          <div className="text-sm text-gray-400">Samples</div>
        </div>
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-green-400">{overall.avg_ms || 0}ms</div>
          <div className="text-sm text-gray-400">Avg</div>
        </div>
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-purple-400">{overall.p50_ms || 0}ms</div>
          <div className="text-sm text-gray-400">P50</div>
        </div>
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-yellow-400">{overall.p95_ms || 0}ms</div>
          <div className="text-sm text-gray-400">P95</div>
        </div>
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-orange-400">{overall.p99_ms || 0}ms</div>
          <div className="text-sm text-gray-400">P99</div>
        </div>
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-gray-400">{overall.min_ms || 0}ms</div>
          <div className="text-sm text-gray-400">Min</div>
        </div>
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-red-400">{overall.max_ms || 0}ms</div>
          <div className="text-sm text-gray-400">Max</div>
        </div>
      </div>

      {commandData.length > 0 && (
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
          <h3 className="text-lg text-white mb-4">Avg Execution Time by Command (ms)</h3>
          <div style={{ width: '100%', height: Math.max(200, commandData.length * 32) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={commandData} layout="vertical" margin={{ left: 80, right: 20 }}>
                <XAxis type="number" tick={{ fill: '#9ca3af', fontSize: 12 }} />
                <YAxis type="category" dataKey="name" tick={{ fill: '#9ca3af', fontSize: 12 }} width={75} />
                <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: 8 }} />
                <Bar dataKey="value" fill="rgb(59, 130, 246)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {byCommand.length > 0 && (
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
          <h3 className="text-xl text-white mb-4">Command Performance</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-gray-400 border-b border-gray-700">
                  <th className="pb-2 px-4">Command</th>
                  <th className="pb-2 px-4">Avg (ms)</th>
                  <th className="pb-2 px-4">P95 (ms)</th>
                  <th className="pb-2 px-4">Executions</th>
                </tr>
              </thead>
              <tbody>
                {byCommand.map((cmd, idx) => (
                  <tr key={idx} className="border-b border-gray-700/50 text-gray-300">
                    <td className="py-2 px-4">{cmd.command_name}</td>
                    <td className="py-2 px-4">{cmd.avg_ms}</td>
                    <td className="py-2 px-4">{cmd.p95_ms}</td>
                    <td className="py-2 px-4">{cmd.execution_count}</td>
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
