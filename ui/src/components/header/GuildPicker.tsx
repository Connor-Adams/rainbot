import { useQuery } from '@tanstack/react-query';
import { Combobox } from '@connor-adams/designsystem';
import { botApi } from '@/lib/api';
import { useGuildStore } from '@/stores/guildStore';
import type { Guild } from '@/types';

export default function GuildPicker() {
  const { selectedGuildId, setSelectedGuildId } = useGuildStore();

  const { data: status } = useQuery({
    queryKey: ['bot-status'],
    queryFn: () => botApi.getStatus().then((res) => res.data),
    refetchInterval: 5000,
  });

  const guilds: Guild[] = status?.guilds || [];
  const isEmpty = guilds.length === 0;

  return (
    <Combobox
      options={guilds.map((guild) => ({ value: guild.id, label: guild.name }))}
      value={selectedGuildId}
      onValueChange={setSelectedGuildId}
      placeholder={isEmpty ? 'Loading servers...' : 'Select a server...'}
      size="sm"
      aria-disabled={isEmpty}
      className={isEmpty ? 'pointer-events-none opacity-50' : undefined}
    />
  );
}
