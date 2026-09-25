import { statsApi } from '@/lib/api';
import { useStatsQuery } from '@/hooks/useStatsQuery';
import {
  EmptyState,
  StatsLoading,
  StatsError,
  StatCard,
  StatsSection,
  StatsTable,
  ChartContainer,
  chartColor,
  chartTheme,
} from '@/components/common';
import { StatGrid } from '@connor-adams/designsystem';
import { safeInt } from '@/lib/chartSafety';
import { formatSessionDuration } from '@/lib/utils';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

interface SessionSummary {
  total_sessions: string;
  unique_users: string;
  avg_duration_seconds: string;
  total_duration_seconds: string;
  avg_tracks_per_session: string;
  total_tracks_heard: string;
}

interface UserSession {
  session_id: string;
  user_id: string;
  username: string;
  channel_name: string;
  started_at: string;
  /**
   * `user_voice_sessions.duration_seconds` is a nullable `INTEGER`, so
   * node-postgres yields a number (or `null`), not a string — unlike the
   * `SUM(...)`/`ROUND(...)::numeric` aggregates on this response, which really
   * do arrive as strings because Postgres returns them as `bigint`/`numeric`.
   */
  duration_seconds: number | null;
  tracks_heard: string;
}

interface TopListener {
  user_id: string;
  username: string;
  session_count: string;
  total_duration: string;
  total_tracks: string;
}

interface UserSessionsData {
  summary: SessionSummary;
  sessions: UserSession[];
  topListeners: TopListener[];
}

export default function UserSessionsStats() {
  const { data, isLoading, error } = useStatsQuery<UserSessionsData>({
    queryKey: ['stats', 'user-sessions'],
    queryFn: ({ signal }) => statsApi.userSessions({ signal }),
    refetchInterval: 10000,
  });

  if (isLoading) return <StatsLoading message="Loading user sessions..." />;
  if (error) return <StatsError error={error} message="Error loading user sessions" />;
  if (!data) return null;

  const summary: SessionSummary = data.summary || {
    total_sessions: '0',
    unique_users: '0',
    avg_duration_seconds: '0',
    total_duration_seconds: '0',
    avg_tracks_per_session: '0',
    total_tracks_heard: '0',
  };
  const totalSessions = safeInt(summary.total_sessions);
  const sessions = Array.isArray(data.sessions) ? data.sessions : [];
  const topListeners = Array.isArray(data.topListeners) ? data.topListeners : [];

  if (totalSessions === 0 && sessions.length === 0) {
    return (
      <EmptyState
        icon="👤"
        message="No user session data available"
        submessage="User listening sessions will appear here once users join voice channels"
      />
    );
  }

  const avgTracksPerSession = (() => {
    const avg = parseFloat(summary.avg_tracks_per_session || '0');
    return isNaN(avg) ? '0.0' : avg.toFixed(1);
  })();

  const chartData = topListeners.slice(0, 10).map((l) => ({
    name: l.username || l.user_id?.substring(0, 8) || 'Unknown',
    value: safeInt(l.total_duration),
  }));

  const listenerColumns = [
    {
      id: 'user',
      header: 'User',
      render: (listener: TopListener) => listener.username || listener.user_id,
      className: 'py-2 px-4 text-text-secondary',
    },
    {
      id: 'sessions',
      header: 'Sessions',
      render: (listener: TopListener) => listener.session_count,
      className: 'py-2 px-4 text-text-secondary',
    },
    {
      id: 'total_duration',
      header: 'Total Duration',
      render: (listener: TopListener) => formatSessionDuration(safeInt(listener.total_duration)),
      className: 'py-2 px-4 text-text-secondary',
    },
    {
      id: 'tracks_heard',
      header: 'Tracks Heard',
      render: (listener: TopListener) => listener.total_tracks,
      className: 'py-2 px-4 text-text-secondary',
    },
  ];

  return (
    <div className="space-y-6">
      <StatGrid columns="auto" minItemWidth={160} gap="lg">
        <StatCard value={summary.total_sessions || '0'} label="Total Sessions" />
        <StatCard value={summary.unique_users || '0'} label="Unique Users" />
        <StatCard
          value={formatSessionDuration(safeInt(summary.avg_duration_seconds))}
          label="Avg Duration"
        />
        <StatCard
          value={formatSessionDuration(safeInt(summary.total_duration_seconds))}
          label="Total Duration"
        />
        <StatCard value={avgTracksPerSession} label="Avg Tracks/Session" />
        <StatCard value={summary.total_tracks_heard || '0'} label="Total Tracks" />
      </StatGrid>

      {chartData.length > 0 && (
        <ChartContainer
          title="Top Listeners (by duration)"
          height="auto"
          rowCount={chartData.length}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} layout="vertical" margin={{ left: 80, right: 20 }}>
              <XAxis type="number" tick={chartTheme.axis.tick} />
              <YAxis type="category" dataKey="name" tick={chartTheme.axis.tick} width={75} />
              <Tooltip contentStyle={chartTheme.tooltip.contentStyle} />
              <Bar dataKey="value" fill={chartColor(0)} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartContainer>
      )}

      {topListeners.length > 0 && (
        <StatsSection title="Top Listeners Details">
          <StatsTable
            columns={listenerColumns}
            data={topListeners}
            getRowKey={(listener: TopListener) => listener.user_id}
          />
        </StatsSection>
      )}
    </div>
  );
}
