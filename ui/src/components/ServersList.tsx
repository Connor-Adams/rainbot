import { useQuery } from '@tanstack/react-query'
import { botApi } from '@/lib/api'
import type { Guild } from '@/types'
import { escapeHtml } from '@/lib/utils'

export default function ServersList() {
  const { data: status } = useQuery({
    queryKey: ['bot-status'],
    queryFn: () => botApi.getStatus().then((res) => res.data),
    refetchInterval: 5000,
  })

  const guilds = status?.guilds || []

  if (guilds.length === 0) {
    return (
      <section className="panel servers-panel bg-gray-800 rounded-2xl border border-gray-700 p-6">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
          <span className="w-1 h-4 bg-gradient-to-b from-blue-500 to-indigo-500 rounded shadow-lg shadow-blue-500/40"></span>
          Servers
        </h2>
        <div className="empty-state text-gray-500 text-sm text-center py-8 px-6 flex flex-col items-center gap-2">
          <span className="text-2xl opacity-50">🏠</span>
          No servers available
        </div>
      </section>
    )
  }

  return (
    <section className="panel servers-panel bg-gray-800 rounded-2xl border border-gray-700 p-6">
      <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
        <span className="w-1 h-4 bg-gradient-to-b from-blue-500 to-indigo-500 rounded shadow-lg shadow-blue-500/40"></span>
        Servers
      </h2>
      <div className="servers-list flex flex-col gap-2">
        {guilds.map((guild: Guild) => (
          <div key={guild.id} className="server-item flex items-center gap-3 px-3 py-3">
            <span className="icon text-xl flex-shrink-0">🏠</span>
            <div className="info flex-1 min-w-0">
              <div className="name text-sm font-medium text-white whitespace-nowrap overflow-hidden text-ellipsis mb-1">
                {escapeHtml(guild.name)}
              </div>
              <div className="detail text-xs text-gray-500">{guild.memberCount} members</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

