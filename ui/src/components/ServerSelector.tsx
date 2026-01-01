import { useQuery } from '@tanstack/react-query'
import { botApi } from '@/lib/api'
import { useGuildStore } from '@/stores/guildStore'
import type { Guild } from '@/types'
import DisplayCard from './Displaycard'
import CustomDropdown from './CustomDropdown'

export default function ServerSelector() {
  const { selectedGuildId, setSelectedGuildId } = useGuildStore()

  const { data: status } = useQuery({
    queryKey: ['bot-status'],
    queryFn: () => botApi.getStatus().then((res) => res.data),
    refetchInterval: 5000,
  })

  const guilds = status?.guilds || []

  return (
    <div className="server-selector-wrapper bg-gray-800 rounded-2xl border border-gray-700 p-6">
      <label
        className="block text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2"
      >
        <span className="w-1 h-4 bg-gradient-to-b from-red-500 to-black-500 rounded shadow-lg shadow-blue-500/40"></span>
        Select Server
      </label>
      <CustomDropdown<Guild>
        items={guilds}
        selectedValue={selectedGuildId}
        onSelect={setSelectedGuildId}
        getItemId={(guild) => guild.id}
        getItemLabel={(guild) => guild.name}
        renderItem={(guild) => <DisplayCard name={guild.name} />}
        placeholder="Select a server..."
        emptyMessage="Loading servers..."
      />
    </div>
  )
}

