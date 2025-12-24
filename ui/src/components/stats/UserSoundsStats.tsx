import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { statsApi } from '@/lib/api'
import { useGuildStore } from '@/stores/guildStore'

export default function UserSoundsStats({ userId: initialUserId = '' }: { userId?: string }) {
  const { selectedGuildId } = useGuildStore()
  const [userId, setUserId] = useState(initialUserId || '')
  useEffect(() => {
    if (initialUserId) setUserId(initialUserId)
  }, [initialUserId])
  const [limit, setLimit] = useState(100)

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['stats', 'user-sounds', userId, selectedGuildId, limit],
    queryFn: () =>
      statsApi
        .userSounds({ userId, guildId: selectedGuildId || undefined, limit })
        .then((res) => res.data),
    enabled: !!userId,
    refetchInterval: 30000,
  })

  const handleFilter = () => refetch()

  if (!userId) {
    return (
      <div className="stats-section bg-gray-800 border border-gray-700 rounded-xl p-6">
        <h3 className="text-xl text-white mb-4">User Sounds</h3>
        <p className="text-gray-400">Enter a user ID to view which sounds they played.</p>
        <div className="mt-4 flex gap-2">
          <input
            type="text"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            placeholder="User ID"
            className="px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm"
          />
          <button className="btn btn-primary" onClick={handleFilter}>
            Load
          </button>
        </div>
      </div>
    )
  }

  if (isLoading) {
    return <div className="stats-loading text-center py-12 text-gray-400">Loading user sounds...</div>
  }

  if (error) {
    return (
      <div className="stats-error text-center py-12 text-red-400">
        Error: {error instanceof Error ? error.message : 'Unknown error'}
      </div>
    )
  }

  const sounds = data?.sounds || []

  return (
    <div className="stats-section bg-gray-800 border border-gray-700 rounded-xl p-6">
      <h3 className="text-xl text-white mb-4">User Sounds</h3>
      <div className="mb-4 flex gap-2">
        <input
          type="text"
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          placeholder="User ID"
          className="px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm"
        />
        <input
          type="number"
          value={limit}
          onChange={(e) => setLimit(Number(e.target.value))}
          className="w-24 px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm"
        />
        <button className="btn btn-secondary px-4 py-2" onClick={handleFilter}>
          Filter
        </button>
      </div>

      {sounds.length === 0 ? (
        <p className="empty-state text-gray-500 text-sm text-center py-8">No sounds found</p>
      ) : (
        <table className="stats-table w-full">
          <thead>
            <tr>
              <th>Sound</th>
              <th>Type</th>
              <th>Plays</th>
              <th>Avg Duration</th>
              <th>Last Played</th>
            </tr>
          </thead>
          <tbody>
            {sounds.map((s: any, i: number) => (
              <tr key={i} className="hover:bg-gray-700/50 transition-colors">
                <td className="px-4 py-3 text-white">{s.sound_name}</td>
                <td className="px-4 py-3 text-gray-400">{s.is_soundboard ? 'Soundboard' : 'Regular'}</td>
                <td className="px-4 py-3 text-gray-400 font-mono">{s.play_count}</td>
                <td className="px-4 py-3 text-gray-400">{s.avg_duration ? s.avg_duration.toFixed?.(2) ?? s.avg_duration : '-'}</td>
                <td className="px-4 py-3 text-gray-400">{s.last_played ? new Date(s.last_played).toLocaleString() : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
