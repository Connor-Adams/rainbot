import { useQuery } from '@tanstack/react-query';
import { Combobox } from '@connor-adams/designsystem';
import { botApi } from '@/lib/api';
import { useGuildStore } from '@/stores/guildStore';
import type { Guild } from '@/types';

export default function ServerSelector() {
  const { selectedGuildId, setSelectedGuildId } = useGuildStore();

  const { data: status } = useQuery({
    queryKey: ['bot-status'],
    queryFn: () => botApi.getStatus().then((res) => res.data),
    refetchInterval: 5000,
  });

  const guilds: Guild[] = status?.guilds || [];
  const hasGuilds = guilds.length > 0;

  return (
    <div className="server-selector-wrapper bg-surface rounded-2xl border border-border p-5">
      {/* `htmlFor` + the Combobox's `id` is new: the old label wrapped nothing and
          named nothing. The design system routes `id` to the inner search
          `<input>` - the element that takes focus - so this actually associates. */}
      <label
        htmlFor="server-selector"
        className="block text-sm font-semibold text-text-secondary mb-3"
      >
        Select Server
      </label>
      <Combobox
        id="server-selector"
        className="w-full"
        options={guilds.map((guild) => ({ value: guild.id, label: guild.name }))}
        value={selectedGuildId}
        onValueChange={setSelectedGuildId}
        // `Combobox` has no working `disabled` - it would land on the wrapper
        // `<div>` and do nothing - so the pre-load state is carried by the copy
        // rather than by disabling the control, as the old trigger button did.
        placeholder={hasGuilds ? 'Select a server...' : 'Loading servers...'}
        emptyText={hasGuilds ? 'No servers match' : 'Loading servers...'}
      />
    </div>
  );
}
