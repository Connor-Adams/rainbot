import { useState } from 'react';
import { statsApi } from '@/lib/api';
import { useGuildStore } from '@/stores/guildStore';
import type { ListeningHistoryEntry } from '@/types';
import { formatDurationLong } from '@/lib/utils';
import { StatsLoading, StatsError, StatsSection, StatsTable } from '@/components/common';
import { useStatsQuery } from '@/hooks/useStatsQuery';
import { Button } from '@/components/ui';
import { safeDateTimeLabel } from '@/lib/chartSafety';

export default function HistoryStats() {
  const { selectedGuildId } = useGuildStore();
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [appliedStartDate, setAppliedStartDate] = useState('');
  const [appliedEndDate, setAppliedEndDate] = useState('');

  const { data, isLoading, error } = useStatsQuery({
    queryKey: ['stats', 'history', selectedGuildId, appliedStartDate, appliedEndDate],
    queryFn: ({ signal }) =>
      statsApi.history({
        guildId: selectedGuildId || undefined,
        limit: 100,
        startDate: appliedStartDate || undefined,
        endDate: appliedEndDate || undefined,
        signal,
      }),
  });

  const handleFilter = () => {
    setAppliedStartDate(startDate);
    setAppliedEndDate(endDate);
  };

  const history: ListeningHistoryEntry[] = data?.history || [];

  const columns = [
    {
      id: 'track',
      header: 'Track',
      render: (entry: ListeningHistoryEntry) => (
        <div className="flex items-center gap-2">
          {entry.is_soundboard && <span className="text-lg">🔊</span>}
          <span className="text-sm text-text-primary">{entry.track_title}</span>
        </div>
      ),
      className: 'px-4 py-3',
    },
    {
      id: 'source',
      header: 'Source',
      render: (entry: ListeningHistoryEntry) => {
        const sourceIcon =
          entry.source_type === 'youtube'
            ? '▶️'
            : entry.source_type === 'spotify'
              ? '🎵'
              : entry.source_type === 'soundcloud'
                ? '🎧'
                : entry.source_type === 'local'
                  ? '📁'
                  : '🎵';
        return (
          <>
            {sourceIcon} {entry.source_type}
          </>
        );
      },
      className: 'px-4 py-3 text-sm text-text-secondary',
    },
    {
      id: 'duration',
      header: 'Duration',
      render: (entry: ListeningHistoryEntry) =>
        entry.duration ? formatDurationLong(entry.duration) : '-',
      className: 'px-4 py-3 text-sm text-text-secondary font-mono',
    },
    {
      id: 'user',
      header: 'User',
      render: (entry: ListeningHistoryEntry) =>
        entry.username ? (
          <span>{entry.username}</span>
        ) : entry.user_id ? (
          <code className="text-xs">{entry.user_id}</code>
        ) : (
          <em>Unknown</em>
        ),
      className: 'px-4 py-3 text-sm text-text-secondary',
    },
    {
      id: 'played_at',
      header: 'Played At',
      render: (entry: ListeningHistoryEntry) => safeDateTimeLabel(entry.played_at),
      className: 'px-4 py-3 text-sm text-text-secondary',
    },
  ];

  return (
    <StatsSection title="Listening History">
      {/* The design system has no date picker, so the two range inputs stay
          native. They keep the body rather than `StatsSection`'s `actions`
          slot: the row is `flex-col sm:flex-row` with a full-width button on
          narrow screens, and a trailing-aligned header slot would drop that
          responsive behaviour. */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className="px-4 py-2 bg-surface-input border border-border rounded-lg text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          placeholder="Start date"
        />
        <input
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          className="px-4 py-2 bg-surface-input border border-border rounded-lg text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          placeholder="End date"
        />
        <Button variant="secondary" className="px-4 py-2 w-full sm:w-auto" onClick={handleFilter}>
          Filter
        </Button>
      </div>
      {/* The loading and error states render *here*, below the filter row, rather
          than replacing the whole section from an early `return`. This section is
          the only one whose request the user parameterises, and the most likely
          cause of an error is the range they just entered — an early return
          unmounted the two date inputs and the Filter button along with the
          table, leaving no control on screen to correct it with. */}
      {isLoading ? (
        <StatsLoading message="Loading listening history..." />
      ) : error ? (
        <StatsError error={error} />
      ) : (
        /* `StatsTable`'s own empty state is `EmptyState icon="📭"`, which is the
           same 📭 + message the hand-rolled `empty-state` paragraph rendered —
           so the divergent block is gone rather than normalised by hand.
           `ListeningHistoryEntry` carries no stable id, so the row key stays the
           array index, as it was. */
        <StatsTable<ListeningHistoryEntry>
          columns={columns}
          data={history}
          emptyMessage="No listening history found"
        />
      )}
    </StatsSection>
  );
}
