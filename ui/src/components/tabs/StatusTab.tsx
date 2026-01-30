import { useQuery } from '@tanstack/react-query';
import { botApi } from '@/lib/api';

type WorkerStatus = {
  connected?: boolean;
  playing?: boolean;
  queueLength?: number;
  activePlayers?: number;
  volume?: number;
};

type ConnectionStatus = {
  guildId?: string;
  channelId?: string | null;
  channelName?: string | null;
  isPlaying?: boolean;
  volume?: number;
  workers?: {
    rainbot?: WorkerStatus;
    pranjeet?: WorkerStatus;
    hungerbot?: WorkerStatus;
  };
};

type StatusResponse = {
  online?: boolean;
  username?: string;
  discriminator?: string;
  guilds?: Array<{ id: string; name: string; memberCount: number }>;
  connections?: ConnectionStatus[];
};

export default function StatusTab() {
  const {
    data: status,
    refetch,
    isFetching,
  } = useQuery<StatusResponse>({
    queryKey: ['bot-status'],
    queryFn: () => botApi.getStatus().then((res) => res.data),
    refetchInterval: 5000,
  });

  const connections = status?.connections ?? [];
  const guilds = status?.guilds ?? [];
  const guildNameById = new Map(guilds.map((g) => [g.id, g.name]));

  return (
    <section className="panel bg-surface rounded-2xl border border-border p-4 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">Service Status</h2>
          <p className="text-sm text-text-secondary">
            {status?.online ? 'Online' : 'Offline'}{' '}
            {status?.username ? `as ${status.username}` : ''}
          </p>
        </div>
        <button
          onClick={() => refetch()}
          className="btn btn-secondary w-full sm:w-auto"
          disabled={isFetching}
        >
          {isFetching ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      <div className="space-y-4">
        {connections.length === 0 && (
          <div className="text-sm text-text-secondary">No active voice sessions yet.</div>
        )}
        {connections.map((connection) => {
          const guildName = connection.guildId
            ? guildNameById.get(connection.guildId) || connection.guildId
            : 'Unknown Guild';
          const workers = connection.workers || {};
          return (
            <div
              key={`${connection.guildId || 'unknown'}-${connection.channelId || 'none'}`}
              className="rounded-xl border border-border bg-surface-input p-4"
            >
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="text-sm font-semibold text-text-primary">{guildName}</div>
                  <div className="text-xs text-text-secondary">
                    Channel: {connection.channelName || 'Unknown'}
                  </div>
                </div>
                <div className="text-xs text-text-muted">
                  {connection.isPlaying ? 'Playing' : 'Idle'}
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-lg border border-border bg-surface p-3">
                  <div className="text-xs text-text-secondary mb-1">Rainbot</div>
                  <div className="text-sm text-text-primary">
                    {workers.rainbot?.connected ? 'Connected' : 'Offline'}
                  </div>
                  <div className="text-xs text-text-muted">
                    Queue: {workers.rainbot?.queueLength ?? 0}
                  </div>
                  <div className="text-xs text-text-muted">
                    Volume: {workers.rainbot?.volume ?? 0}%
                  </div>
                </div>
                <div className="rounded-lg border border-border bg-surface p-3">
                  <div className="text-xs text-text-secondary mb-1">Pranjeet</div>
                  <div className="text-sm text-text-primary">
                    {workers.pranjeet?.connected ? 'Connected' : 'Offline'}
                  </div>
                  <div className="text-xs text-text-muted">
                    Playing: {workers.pranjeet?.playing ? 'Yes' : 'No'}
                  </div>
                  <div className="text-xs text-text-muted">
                    Volume: {workers.pranjeet?.volume ?? 0}%
                  </div>
                </div>
                <div className="rounded-lg border border-border bg-surface p-3">
                  <div className="text-xs text-text-secondary mb-1">Hungerbot</div>
                  <div className="text-sm text-text-primary">
                    {workers.hungerbot?.connected ? 'Connected' : 'Offline'}
                  </div>
                  <div className="text-xs text-text-muted">
                    Active: {workers.hungerbot?.activePlayers ?? 0}
                  </div>
                  <div className="text-xs text-text-muted">
                    Volume: {workers.hungerbot?.volume ?? 0}%
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
