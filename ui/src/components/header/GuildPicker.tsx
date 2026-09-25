import { useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Combobox } from '@connor-adams/designsystem';
import { botApi } from '@/lib/api';
import { useGuildStore } from '@/stores/guildStore';
import type { Guild } from '@/types';

export default function GuildPicker() {
  const { selectedGuildId, setSelectedGuildId } = useGuildStore();

  const { data: status, isSuccess } = useQuery({
    queryKey: ['bot-status'],
    queryFn: ({ signal }) => botApi.getStatus({ signal }).then((res) => res.data),
    refetchInterval: 5000,
  });

  const guilds: Guild[] = useMemo(() => status?.guilds ?? [], [status]);
  const isEmpty = guilds.length === 0;

  // `selectedGuildId` is persisted to localStorage, so it can outlive the bot's
  // membership of that guild. Every consumer gates only on the id being truthy,
  // so a stale id means the header shows no selection while the tabs happily
  // fire mutations at a guild the bot has left. Clear it centrally, here.
  //
  // Deliberately narrow: only when the status query has actually *resolved*
  // (`isSuccess`) with a *non-empty* guild list, and the id is genuinely absent
  // from it. A loading, erroring or empty list means the bot is unreachable or
  // still starting up — that must never wipe the user's selection.
  useEffect(() => {
    if (!isSuccess) return;
    if (!selectedGuildId) return;
    if (guilds.length === 0) return;
    if (guilds.some((guild) => guild.id === selectedGuildId)) return;
    setSelectedGuildId(null);
  }, [isSuccess, guilds, selectedGuildId, setSelectedGuildId]);

  return (
    <Combobox
      options={guilds.map((guild) => ({ value: guild.id, label: guild.name }))}
      value={selectedGuildId}
      onValueChange={setSelectedGuildId}
      placeholder={isEmpty ? 'Loading servers...' : 'Select a server...'}
      size="sm"
      // Real `disabled`, not the old `aria-disabled` + `pointer-events-none`
      // shim: that left the control in the tab order and still keyboard-
      // operable, and `aria-disabled` alone does not stop interaction. The
      // design system disables the inner `<input>` and reflects `data-disabled`
      // for styling, so the local `opacity-50` is redundant too.
      disabled={isEmpty}
    />
  );
}
