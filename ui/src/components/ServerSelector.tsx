import { useQuery } from '@tanstack/react-query'
import { botApi } from '@/lib/api'
import { useGuildStore } from '@/stores/guildStore'
import type { Guild } from '@/types'
import { escapeHtml } from '@/lib/utils'

export default function ServerSelector() {
  const { selectedGuildId, setSelectedGuildId } = useGuildStore()

  const { data: status } = useQuery({
    queryKey: ['bot-status'],
    queryFn: () => botApi.getStatus().then((res) => res.data),
    refetchInterval: 5000,
  })

  const guilds = status?.guilds || []
  const selectedGuild = guilds.find((g: Guild) => g.id === selectedGuildId)

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedGuildId(e.target.value || null)
  }

  return (
    <div className="server-selector-wrapper bg-gray-800 rounded-2xl border border-gray-700 p-6">
      <label
        htmlFor="server-selector"
        className="block text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2"
      >
        <span className="w-1 h-4 bg-gradient-to-b from-blue-500 to-indigo-500 rounded shadow-lg shadow-blue-500/40"></span>
        Select Server
      </label>
      <select
        id="server-selector"
        value={selectedGuildId || ''}
        onChange={handleChange}
        className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 hover:border-gray-600 appearance-none cursor-pointer"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23a1a1b0' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`,
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'right 1rem center',
          paddingRight: '2.5rem',
        }}
        disabled={guilds.length === 0}
      >
        <option value="">{guilds.length > 0 ? 'Select a server...' : 'Loading servers...'}</option>
        {guilds.map((guild: Guild) => (
          <option key={guild.id} value={guild.id}>
            {escapeHtml(guild.name)}
          </option>
        ))}
      </select>
      {selectedGuild && (
        <p className="mt-3 text-xs text-gray-400">
          Selected:{' '}
          <span className="text-blue-400 font-medium">{escapeHtml(selectedGuild.name)}</span>
        </p>
      )}
    </div>
  )
}

