import { useState } from 'react'
import { statsApi } from '@/lib/api'
import { useGuildStore } from '@/stores/guildStore'
import type { ListeningHistoryEntry } from '@/types'
import { escapeHtml, formatDurationLong } from '@/lib/utils'
import { StatsLoading, StatsError, StatsSection } from '@/components/common'
import { useStatsQuery } from '@/hooks/useStatsQuery'

export default function HistoryStats() {
  const { selectedGuildId } = useGuildStore()
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [appliedStartDate, setAppliedStartDate] = useState('')
  const [appliedEndDate, setAppliedEndDate] = useState('')

  const { data, isLoading, error } = useStatsQuery({
    queryKey: ['stats', 'history', selectedGuildId, appliedStartDate, appliedEndDate],
    queryFn: () =>
      statsApi.history({
        guildId: selectedGuildId || undefined,
        limit: 100,
        startDate: appliedStartDate || undefined,
        endDate: appliedEndDate || undefined,
      }),
  })

  const handleFilter = () => {
    setAppliedStartDate(startDate)
    setAppliedEndDate(endDate)
  }

  if (isLoading) return <StatsLoading message="Loading listening history..." />
  if (error) return <StatsError error={error} />

  const history = data?.history || []

  return (
    <StatsSection title="Listening History">
      <div className="history-filters flex gap-3 mb-6">
        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className="px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Start date"
        />
        <input
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          className="px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="End date"
        />
        <button className="btn btn-secondary px-4 py-2" onClick={handleFilter}>
          Filter
        </button>
      </div>
      <div className="history-list overflow-x-auto">
        {history.length === 0 ? (
          <p className="empty-state text-gray-500 text-sm text-center py-8 px-6 flex flex-col items-center gap-2">
            <span className="text-2xl opacity-50">📭</span>
            No listening history found
          </p>
        ) : (
          <table className="stats-table w-full">
            <thead>
              <tr>
                <th>Track</th>
                <th>Source</th>
                <th>Duration</th>
                <th>User</th>
                <th>Played At</th>
              </tr>
            </thead>
            <tbody>
              {history.map((entry: ListeningHistoryEntry, index: number) => {
                const playedAt = new Date(entry.played_at)
                const sourceIcon =
                  entry.source_type === 'youtube'
                    ? '▶️'
                    : entry.source_type === 'spotify'
                      ? '🎵'
                      : entry.source_type === 'soundcloud'
                        ? '🎧'
                        : entry.source_type === 'local'
                          ? '📁'
                          : '🎵'
                const duration = entry.duration ? formatDurationLong(entry.duration) : '-'

                return (
                  <tr key={index} className="hover:bg-gray-700/50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {entry.is_soundboard && <span className="text-lg">🔊</span>}
                        <span className="text-sm text-white">{escapeHtml(entry.track_title)}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-400">
                      {sourceIcon} {entry.source_type}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-400 font-mono">{duration}</td>
                    <td className="px-4 py-3 text-sm text-gray-400">
                      {entry.username ? (
                        <span>{entry.username}</span>
                      ) : entry.user_id ? (
                        <code className="text-xs">{entry.user_id}</code>
                      ) : (
                        <em>Unknown</em>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-400">{playedAt.toLocaleString()}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </StatsSection>
  )
}

