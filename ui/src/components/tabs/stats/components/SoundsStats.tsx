import { useQuery } from '@tanstack/react-query'
import { statsApi } from '@/lib/api'
// CHARTS DISABLED FOR DEBUGGING
import type { SoundStat, SourceType, SoundboardBreakdown } from '@/types'

export default function SoundsStats() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['stats', 'sounds'],
    queryFn: () => statsApi.sounds().then((res) => res.data),
    refetchInterval: 30000,
  })

  if (isLoading) {
    return <div className="stats-loading text-center py-12 text-gray-400">Loading sound statistics...</div>
  }

  if (error) {
    return (
      <div className="stats-error text-center py-12 text-red-400">
        Error: {error instanceof Error ? error.message : 'Unknown error'}
      </div>
    )
  }

  // Safe data access with defaults
  const sounds = Array.isArray(data?.sounds) ? data.sounds : []
  const sourceTypes = Array.isArray(data?.sourceTypes) ? data.sourceTypes : []
  const soundboardBreakdown = Array.isArray(data?.soundboardBreakdown) ? data.soundboardBreakdown : []
  
  if (!data || sounds.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-8 px-6 text-center">
        <span className="text-3xl opacity-50">🔊</span>
        <p className="text-sm text-gray-400">No sound data available yet</p>
        <small className="text-xs text-gray-500">Sound statistics will appear as users play sounds</small>
      </div>
    )
  }

  const top10 = sounds.slice(0, 10)

  return (
    <div className="space-y-6">
      {/* Top Sounds Table - Charts disabled for debugging */}
      <div className="stats-section bg-gray-800 border border-gray-700 rounded-xl p-6">
        <h3 className="text-xl text-white mb-4">Top Sounds</h3>
        <table className="w-full text-left">
          <thead>
            <tr className="text-gray-400 border-b border-gray-700">
              <th className="pb-2">Sound</th>
              <th className="pb-2">Plays</th>
            </tr>
          </thead>
          <tbody>
            {top10.map((s: SoundStat, idx: number) => (
              <tr key={idx} className="border-b border-gray-700/50 text-gray-300">
                <td className="py-2">{s.sound_name || 'Unknown'}</td>
                <td className="py-2">{parseInt(s.count) || 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      {/* Source Types - Charts disabled */}
      {sourceTypes.length > 0 && (
        <div className="stats-section bg-gray-800 border border-gray-700 rounded-xl p-6">
          <h3 className="text-xl text-white mb-4">Source Types</h3>
          <div className="grid grid-cols-2 gap-2">
            {sourceTypes.map((s: SourceType, idx: number) => (
              <div key={idx} className="bg-gray-700 p-2 rounded">
                <span className="text-gray-300">{s.source_type || 'Unknown'}: </span>
                <span className="text-white font-bold">{parseInt(s.count) || 0}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Soundboard Breakdown */}
      {soundboardBreakdown.length > 0 && (
        <div className="stats-section bg-gray-800 border border-gray-700 rounded-xl p-6">
          <h3 className="text-xl text-white mb-4">Soundboard vs Regular</h3>
          <div className="grid grid-cols-2 gap-2">
            {soundboardBreakdown.map((b: SoundboardBreakdown, idx: number) => (
              <div key={idx} className="bg-gray-700 p-2 rounded">
                <span className="text-gray-300">{b.is_soundboard ? 'Soundboard' : 'Regular'}: </span>
                <span className="text-white font-bold">{parseInt(b.count) || 0}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

