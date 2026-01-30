import { useQuery } from '@tanstack/react-query';
import { statsApi } from '@/lib/api';
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
  const { data, isLoading, error } = useQuery<UserTracksData>({
    queryKey: ['stats', 'user-tracks'],
    queryFn: () => statsApi.userTracks().then((r) => r.data),
    refetchInterval: 10000,
  });

  if (isLoading)
    return <div className="stats-loading text-center py-12">Loading user tracks...</div>;
  if (error) return <div className="stats-error text-center py-12">Error loading user tracks</div>;

  const topTracks = Array.isArray(data?.topTracks) ? data.topTracks : [];
  const recentListens = Array.isArray(data?.recentListens) ? data.recentListens : [];
  const sourceTypes = Array.isArray(data?.sourceTypes) ? data.sourceTypes : [];

  if (!data || (topTracks.length === 0 && recentListens.length === 0)) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-8 px-6 text-center">
        <span className="text-3xl opacity-50">🎵</span>
        <p className="text-sm text-text-secondary">No user track data available yet</p>
        <small className="text-xs text-text-muted">
          Track data will appear as users listen to music
        </small>
      </div>
    );
  }

  const topTracksData = topTracks.slice(0, 10).map((t) => ({
    name: (t.track_title || 'Unknown').substring(0, 25),
    value: safeInt(t.listen_count),
  }));

  const sourceColors = [
    'rgb(34, 197, 94)',
    'rgb(59, 130, 246)',
    'rgb(251, 146, 60)',
    'rgb(168, 85, 247)',
  ];
  const sourceData = sourceTypes
    .map((s, idx) => ({
      name: s.source_type || 'Unknown',
      value: safeInt(s.count),
      color: sourceColors[idx % 4],
    }))
    .filter((d) => d.value > 0);

  return (
    <div className="space-y-6">
      <div className="grid md:grid-cols-2 gap-6">
        {sourceData.length > 0 && (
          <div className="bg-surface border border-border rounded-xl p-6">
            <h3 className="text-lg text-text-primary mb-4">Track Sources</h3>
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
                    label={({ name, percent }: { name: string; percent: number }) =>
                      `${name} (${(percent * 100).toFixed(0)}%)`
                    }
                    labelLine={{ stroke: '#6b7280' }}
                  >
                    {sourceData.map((entry, index) => (
                      <Cell key={index} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1f2937',
                      border: '1px solid #374151',
                      borderRadius: 8,
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {topTracksData.length > 0 && (
          <div className="bg-surface border border-border rounded-xl p-6">
            <h3 className="text-lg text-text-primary mb-4">Most Listened Tracks</h3>
            <div style={{ width: '100%', height: Math.max(200, topTracksData.length * 32) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topTracksData} layout="vertical" margin={{ left: 100, right: 20 }}>
                  <XAxis type="number" tick={{ fill: '#9ca3af', fontSize: 12 }} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fill: '#9ca3af', fontSize: 12 }}
                    width={95}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1f2937',
                      border: '1px solid #374151',
                      borderRadius: 8,
                    }}
                  />
                  <Bar dataKey="value" fill="rgb(168, 85, 247)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>

      {topTracks.length > 0 && (
        <div className="bg-surface border border-border rounded-xl p-6">
          <h3 className="text-xl text-text-primary mb-4">Top Tracks Details</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-text-secondary border-b border-border">
                  <th className="pb-2 px-4">Track</th>
                  <th className="pb-2 px-4">Source</th>
                  <th className="pb-2 px-4">Listens</th>
                  <th className="pb-2 px-4">Unique Listeners</th>
                </tr>
              </thead>
              <tbody>
                {topTracks.slice(0, 10).map((track, idx) => (
                  <tr key={idx} className="border-b border-border/50 text-text-secondary">
                    <td className="py-2 px-4">
                      {track.track_url ? (
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
                      )}
                    </td>
                    <td className="py-2 px-4">
                      <span className="px-2 py-1 rounded text-xs bg-surface-hover">
                        {track.source_type}
                      </span>
                    </td>
                    <td className="py-2 px-4">{track.listen_count}</td>
                    <td className="py-2 px-4">{track.unique_listeners}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {recentListens.length > 0 && (
        <div className="bg-surface border border-border rounded-xl p-6">
          <h3 className="text-xl text-text-primary mb-4">Recent Listens</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-text-secondary border-b border-border">
                  <th className="pb-2 px-4">Track</th>
                  <th className="pb-2 px-4">Source</th>
                  <th className="pb-2 px-4">Queued By</th>
                  <th className="pb-2 px-4">Listened At</th>
                </tr>
              </thead>
              <tbody>
                {recentListens.slice(0, 15).map((listen, idx) => (
                  <tr key={idx} className="border-b border-border/50 text-text-secondary">
                    <td className="py-2 px-4">{listen.track_title}</td>
                    <td className="py-2 px-4">
                      <span className="px-2 py-1 rounded text-xs bg-surface-hover">
                        {listen.source_type}
                      </span>
                    </td>
                    <td className="py-2 px-4 font-mono text-sm">{listen.queued_by}</td>
                    <td className="py-2 px-4 text-sm">{safeDateLabel(listen.listened_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
