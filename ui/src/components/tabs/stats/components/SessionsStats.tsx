import { StatGrid } from '@connor-adams/designsystem';
import { statsApi } from '@/lib/api';
import { useStatsQuery } from '@/hooks/useStatsQuery';
import {
  StatsLoading,
  StatsError,
  StatsSection,
  StatsTable,
  StatCard,
  ChartContainer,
  EmptyState,
  chartTheme,
  chartColor,
} from '@/components/common';
import { safeInt, safeDateLabel } from '@/lib/chartSafety';
import { formatSessionDuration } from '@/lib/utils';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

interface SessionSummary {
  total_sessions: string;
  avg_duration_seconds: string;
  total_duration_seconds: string;
  avg_tracks_per_session: string;
  total_tracks: string;
  avg_peak_users: string;
}

interface Session {
  session_id: string;
  channel_name: string;
  started_at: string;
  /**
   * `voice_sessions.duration_seconds` is a plain nullable `INTEGER`
   * (`packages/utils/src/database.ts`), and node-postgres parses `int4` to a JS
   * number — so this arrives as a number, or `null` for a session that never
   * ended. It was declared bare `number`, which hid the null from the one call
   * site below that skipped `safeInt`.
   */
  duration_seconds: number | null;
  tracks_played: number;
  user_count_peak: number;
}

interface DailySession {
  date: string;
  sessions: string;
}

interface SessionsData {
  summary: SessionSummary;
  sessions: Session[];
  daily: DailySession[];
}

export default function SessionsStats() {
  const { data, isLoading, error } = useStatsQuery<SessionsData>({
    queryKey: ['stats', 'sessions'],
    queryFn: ({ signal }) => statsApi.sessions({ signal }),
    refetchInterval: 30000,
  });

  if (isLoading) return <StatsLoading message="Loading session statistics..." />;
  if (error) return <StatsError error={error} />;

  if (!data) return null;

  const summary: SessionSummary = data.summary || {
    total_sessions: '0',
    avg_duration_seconds: '0',
    total_duration_seconds: '0',
    avg_tracks_per_session: '0',
    total_tracks: '0',
    avg_peak_users: '0',
  };
  const sessions: Session[] = Array.isArray(data.sessions) ? data.sessions : [];
  const daily: DailySession[] = Array.isArray(data.daily) ? data.daily : [];

  const totalSessions = safeInt(summary.total_sessions);
  if (totalSessions === 0 && sessions.length === 0) {
    return (
      <EmptyState
        icon="🎵"
        message="No voice session data available"
        submessage="Session statistics will appear here once the bot joins voice channels"
      />
    );
  }

  const chartData = daily
    .slice(0, 14)
    .reverse()
    .map((d) => ({
      name: safeDateLabel(d.date),
      value: safeInt(d.sessions),
    }));

  const sessionColumns = [
    { id: 'channel', header: 'Channel', render: (s: Session) => s.channel_name || 'Unknown' },
    { id: 'started', header: 'Started', render: (s: Session) => safeDateLabel(s.started_at) },
    {
      id: 'duration',
      header: 'Duration',
      render: (s: Session) => formatSessionDuration(safeInt(s.duration_seconds)),
    },
    { id: 'tracks', header: 'Tracks', render: (s: Session) => s.tracks_played },
    { id: 'peak_users', header: 'Peak Users', render: (s: Session) => s.user_count_peak },
  ];

  return (
    <div className="space-y-6">
      <StatGrid columns="auto" minItemWidth={180} gap="md">
        <StatCard value={summary.total_sessions || 0} label="Total Sessions" />
        <StatCard
          value={formatSessionDuration(safeInt(summary.avg_duration_seconds))}
          label="Avg Duration"
        />
        <StatCard
          value={formatSessionDuration(safeInt(summary.total_duration_seconds))}
          label="Total Time"
        />
        <StatCard value={summary.avg_tracks_per_session || 0} label="Avg Tracks/Session" />
        <StatCard value={summary.total_tracks || 0} label="Total Tracks" />
        <StatCard value={summary.avg_peak_users || 0} label="Avg Peak Users" />
      </StatGrid>

      {chartData.length > 0 && (
        <ChartContainer title="Sessions per Day" height={300}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ bottom: 60 }}>
              <XAxis
                dataKey="name"
                tick={chartTheme.axis.tick}
                stroke={chartTheme.axis.stroke}
                angle={-45}
                textAnchor="end"
                interval={0}
              />
              <YAxis tick={chartTheme.axis.tick} stroke={chartTheme.axis.stroke} />
              <Tooltip contentStyle={chartTheme.tooltip.contentStyle} />
              <Bar dataKey="value" fill={chartColor(0)} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartContainer>
      )}

      <StatsSection title="Recent Sessions">
        <StatsTable
          columns={sessionColumns}
          data={sessions.slice(0, 10)}
          emptyMessage="No recent sessions"
          getRowKey={(s: Session) => s.session_id}
        />
      </StatsSection>
    </div>
  );
}
