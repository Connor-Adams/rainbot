import { useQuery } from '@tanstack/react-query';
import { statsApi } from '@/lib/api';
import { EmptyState } from '@/components/common';
import { safeInt, safeDateLabel } from '@/lib/chartSafety';
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
  duration_seconds: number;
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

function formatDuration(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export default function SessionsStats() {
  const { data, isLoading, error } = useQuery<SessionsData>({
    queryKey: ['stats', 'sessions'],
    queryFn: () => statsApi.sessions().then((res) => res.data),
    refetchInterval: 30000,
  });

  if (isLoading) {
    return (
      <div className="stats-loading text-center py-12 text-text-secondary">
        Loading session statistics...
      </div>
    );
  }

  if (error) {
    return (
      <div className="stats-error text-center py-12 text-danger-light">
        Error: {error instanceof Error ? error.message : 'Unknown error'}
      </div>
    );
  }

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

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <div className="bg-surface-hover rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-success-light">{summary.total_sessions || 0}</div>
          <div className="text-sm text-text-secondary">Total Sessions</div>
        </div>
        <div className="bg-surface-hover rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-primary-light">
            {formatDuration(safeInt(summary.avg_duration_seconds))}
          </div>
          <div className="text-sm text-text-secondary">Avg Duration</div>
        </div>
        <div className="bg-surface-hover rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-secondary-light">
            {formatDuration(safeInt(summary.total_duration_seconds))}
          </div>
          <div className="text-sm text-text-secondary">Total Time</div>
        </div>
        <div className="bg-surface-hover rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-warning-light">
            {summary.avg_tracks_per_session || 0}
          </div>
          <div className="text-sm text-text-secondary">Avg Tracks/Session</div>
        </div>
        <div className="bg-surface-hover rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-warning">{summary.total_tracks || 0}</div>
          <div className="text-sm text-text-secondary">Total Tracks</div>
        </div>
        <div className="bg-surface-hover rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-accent-light">{summary.avg_peak_users || 0}</div>
          <div className="text-sm text-text-secondary">Avg Peak Users</div>
        </div>
      </div>

      {chartData.length > 0 && (
        <div className="bg-surface border border-border rounded-xl p-6">
          <h3 className="text-lg text-text-primary mb-4">Sessions per Day</h3>
          <div style={{ width: '100%', height: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ bottom: 60 }}>
                <XAxis
                  dataKey="name"
                  tick={{ fill: '#9ca3af', fontSize: 11 }}
                  angle={-45}
                  textAnchor="end"
                  interval={0}
                />
                <YAxis tick={{ fill: '#9ca3af', fontSize: 12 }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1f2937',
                    border: '1px solid #374151',
                    borderRadius: 8,
                  }}
                />
                <Bar dataKey="value" fill="rgb(34, 197, 94)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <div className="bg-surface border border-border rounded-xl p-6">
        <h3 className="text-xl text-text-primary mb-4">Recent Sessions</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="text-text-secondary border-b border-border">
                <th className="pb-2">Channel</th>
                <th className="pb-2">Started</th>
                <th className="pb-2">Duration</th>
                <th className="pb-2">Tracks</th>
                <th className="pb-2">Peak Users</th>
              </tr>
            </thead>
            <tbody>
              {sessions.slice(0, 10).map((session) => (
                <tr
                  key={session.session_id}
                  className="border-b border-border/50 text-text-secondary"
                >
                  <td className="py-2">{session.channel_name || 'Unknown'}</td>
                  <td className="py-2">{safeDateLabel(session.started_at)}</td>
                  <td className="py-2">{formatDuration(session.duration_seconds)}</td>
                  <td className="py-2">{session.tracks_played}</td>
                  <td className="py-2">{session.user_count_peak}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
