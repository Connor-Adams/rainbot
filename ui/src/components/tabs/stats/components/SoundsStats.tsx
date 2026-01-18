import { useQuery } from '@tanstack/react-query'
import { statsApi } from '@/lib/api'
import type { SoundStat, SourceType, SoundboardBreakdown } from '@/types'
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

export default function SoundsStats() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['stats', 'sounds'],
    queryFn: () => statsApi.sounds().then((res) => res.data),
    refetchInterval: 30000,
  })

  if (isLoading) {
    return <div className="stats-loading text-center py-12 text-text-secondary">Loading sound statistics...</div>
  }

  if (error) {
    return (
      <div className="stats-error text-center py-12 text-danger-light">
        Error: {error instanceof Error ? error.message : 'Unknown error'}
      </div>
    )
  }

  const sounds = Array.isArray(data?.sounds) ? data.sounds : []
  const sourceTypes = Array.isArray(data?.sourceTypes) ? data.sourceTypes : []
  const soundboardBreakdown = Array.isArray(data?.soundboardBreakdown) ? data.soundboardBreakdown : []
  
  if (!data || sounds.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-8 px-6 text-center">
        <span className="text-3xl opacity-50">🔊</span>
        <p className="text-sm text-text-secondary">No sound data available yet</p>
        <small className="text-xs text-text-muted">Sound statistics will appear as users play sounds</small>
      </div>
    )
  }

  const barData = sounds.slice(0, 10).map((s: SoundStat) => ({
    name: (s.sound_name || 'Unknown').substring(0, 20),
    value: safeInt(s.count),
  }))

  const sourceColors = ['rgb(59, 130, 246)', 'rgb(239, 68, 68)', 'rgb(34, 197, 94)', 'rgb(251, 146, 60)']
  const sourceData = sourceTypes.map((s: SourceType, idx: number) => ({
    name: s.source_type || 'Unknown',
    value: safeInt(s.count),
    color: sourceColors[idx % 4],
  })).filter((d: { value: number }) => d.value > 0)

  const sbData = soundboardBreakdown.map((b: SoundboardBreakdown) => ({
    name: b.is_soundboard ? 'Soundboard' : 'Regular',
    value: safeInt(b.count),
    color: b.is_soundboard ? 'rgb(139, 92, 246)' : 'rgb(59, 130, 246)',
  })).filter((d: { value: number }) => d.value > 0)

  return (
    <div className="space-y-6">
      {barData.length > 0 && (
        <div className="bg-surface border border-border rounded-xl p-6">
          <h3 className="text-lg text-text-primary mb-4">Top Sounds</h3>
          <div style={{ width: '100%', height: Math.max(200, barData.length * 32) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData} layout="vertical" margin={{ left: 80, right: 20 }}>
                <XAxis type="number" tick={{ fill: '#9ca3af', fontSize: 12 }} />
                <YAxis type="category" dataKey="name" tick={{ fill: '#9ca3af', fontSize: 12 }} width={75} />
                <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: 8 }} />
                <Bar dataKey="value" fill="rgb(139, 92, 246)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
      
      <div className="grid md:grid-cols-2 gap-6">
        {sourceData.length > 0 && (
          <div className="bg-surface border border-border rounded-xl p-6">
            <h3 className="text-lg text-text-primary mb-4">Source Type Breakdown</h3>
            <div style={{ width: '100%', height: 280 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={sourceData}
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
                    {sourceData.map((entry: { color: string }, index: number) => (
                      <Cell key={index} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: 8 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
        
        {sbData.length > 0 && (
          <div className="bg-surface border border-border rounded-xl p-6">
            <h3 className="text-lg text-text-primary mb-4">Soundboard vs Regular</h3>
            <div style={{ width: '100%', height: 280 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={sbData}
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
                    {sbData.map((entry: { color: string }, index: number) => (
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
