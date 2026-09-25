import { statsApi } from '@/lib/api';
import { useStatsQuery } from '@/hooks/useStatsQuery';
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
import { safeInt, safeDateLabel } from '@/lib/chartSafety';
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

interface TopTrack {
  track_title: string;
  track_url: string;
  source_type: string;
  listen_count: string;
  unique_listeners: string;
}

interface RecentListen {
  track_title: string;
  source_type: string;
  queued_by: string;
  listened_at: string;
}

interface SourceType {
  source_type: string;
  count: string;
}

interface UserTracksData {
  topTracks: TopTrack[];
  recentListens: RecentListen[];
  sourceTypes: SourceType[];
}

export default function UserTracksStats() {
  const { data, isLoading, error } = useStatsQuery<UserTracksData>({
    queryKey: ['stats', 'user-tracks'],
    queryFn: ({ signal }) => statsApi.userTracks({ signal }),
    refetchInterval: 10000,
  });

  if (isLoading) return <StatsLoading message="Loading user tracks..." />;
  if (error) return <StatsError error={error} message="Error loading user tracks" />;

  const topTracks = Array.isArray(data?.topTracks) ? data.topTracks : [];
  const recentListens = Array.isArray(data?.recentListens) ? data.recentListens : [];
  const sourceTypes = Array.isArray(data?.sourceTypes) ? data.sourceTypes : [];

  if (!data || (topTracks.length === 0 && recentListens.length === 0)) {
    return (
      <EmptyState
        icon="🎵"
        message="No user track data available yet"
        submessage="Track data will appear as users listen to music"
      />
    );
  }

  const topTracksData = topTracks.slice(0, 10).map((t) => ({
    name: (t.track_title || 'Unknown').substring(0, 25),
    value: safeInt(t.listen_count),
  }));

  const sourceData = sourceTypes
    .map((s, idx) => ({
      name: s.source_type || 'Unknown',
      value: safeInt(s.count),
      color: chartColor(idx),
    }))
    .filter((d) => d.value > 0);

  const topTracksColumns = [
    {
      id: 'track',
      header: 'Track',
      render: (track: TopTrack) =>
        track.track_url ? (
          <a
            href={track.track_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary-light hover:underline"
          >
            {track.track_title}
          </a>
        ) : (
          track.track_title
        ),
    },
    {
      id: 'source',
      header: 'Source',
      render: (track: TopTrack) => (
        <span className="px-2 py-1 rounded text-xs bg-surface-hover">{track.source_type}</span>
      ),
    },
    { id: 'listens', header: 'Listens', render: (track: TopTrack) => track.listen_count },
    {
      id: 'unique_listeners',
      header: 'Unique Listeners',
      render: (track: TopTrack) => track.unique_listeners,
    },
  ];

  const recentListensColumns = [
    { id: 'track', header: 'Track', render: (listen: RecentListen) => listen.track_title },
    {
      id: 'source',
      header: 'Source',
      render: (listen: RecentListen) => (
        <span className="px-2 py-1 rounded text-xs bg-surface-hover">{listen.source_type}</span>
      ),
    },
    {
      id: 'queued_by',
      header: 'Queued By',
      render: (listen: RecentListen) => listen.queued_by,
      className: 'font-mono text-sm',
    },
    {
      id: 'listened_at',
      header: 'Listened At',
      render: (listen: RecentListen) => safeDateLabel(listen.listened_at),
      className: 'text-sm',
    },
  ];

  return (
    <div className="space-y-6">
      <div className="grid md:grid-cols-2 gap-6">
        {sourceData.length > 0 && (
          <ChartContainer title="Track Sources" height={280}>
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
                  label={pieSliceLabel}
                  labelLine={{ stroke: chartTheme.tooltip.labelLine }}
                >
                  {sourceData.map((entry, index) => (
                    <Cell key={index} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip contentStyle={chartTheme.tooltip.contentStyle} />
              </PieChart>
            </ResponsiveContainer>
          </ChartContainer>
        )}

        {topTracksData.length > 0 && (
          <ChartContainer
            title="Most Listened Tracks"
            height="auto"
            rowCount={topTracksData.length}
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topTracksData} layout="vertical" margin={{ left: 100, right: 20 }}>
                <XAxis type="number" tick={chartTheme.axis.tick} stroke={chartTheme.axis.stroke} />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={chartTheme.axis.tick}
                  stroke={chartTheme.axis.stroke}
                  width={95}
                />
                <Tooltip contentStyle={chartTheme.tooltip.contentStyle} />
                <Bar dataKey="value" fill={chartColor(0)} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartContainer>
        )}
      </div>

      {topTracks.length > 0 && (
        <StatsSection title="Top Tracks Details">
          <StatsTable
            columns={topTracksColumns}
            data={topTracks.slice(0, 10)}
            emptyMessage="No track data"
            getRowKey={(track: TopTrack) => track.track_url || track.track_title}
          />
        </StatsSection>
      )}

      {recentListens.length > 0 && (
        <StatsSection title="Recent Listens">
          <StatsTable
            columns={recentListensColumns}
            data={recentListens.slice(0, 15)}
            emptyMessage="No recent listens"
          />
        </StatsSection>
      )}
    </div>
  );
}
