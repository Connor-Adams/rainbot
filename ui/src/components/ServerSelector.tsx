import { useQuery } from '@tanstack/react-query';
import { botApi } from '@/lib/api';
import { useGuildStore } from '@/stores/guildStore';
import type { Guild } from '@/types';
import DisplayCard from './Displaycard';
import CustomDropdown from './CustomDropdown';

export default function ServerSelector() {
  const { selectedGuildId, setSelectedGuildId } = useGuildStore();

  const { data: status } = useQuery({
    queryKey: ['bot-status'],
    queryFn: () => botApi.getStatus().then((res) => res.data),
    refetchInterval: 5000,
  });

  const guilds = status?.guilds || [];

  return (
    <div className="server-selector-wrapper bg-surface rounded-2xl border border-border p-5">
      <label className="block text-sm font-semibold text-text-secondary mb-3">Select Server</label>
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
  );
}
