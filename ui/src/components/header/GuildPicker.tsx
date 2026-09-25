import { useEffect, useMemo } from 'react';
import { Combobox } from '@connor-adams/designsystem';
import { useBotStatusQuery } from '@/hooks/useLiveQuery';
import { useGuildStore } from '@/stores/guildStore';
import type { Guild } from '@/types';

export default function GuildPicker() {
  const { selectedGuildId, setSelectedGuildId } = useGuildStore();

  const { data: status, isSuccess, isPending, isError } = useBotStatusQuery();

  const guilds: Guild[] = useMemo(() => status?.guilds ?? [], [status]);
  const isEmpty = guilds.length === 0;

  // An empty guild list is three separate situations and only one of them is
  // loading. Using "Loading servers..." for all three left a user in no mutual
  // guilds - or one whose Raincloud is down - watching a placeholder that would
  // never resolve.
  //
  // The non-empty branch is checked first on purpose: once a list has arrived
  // the control is genuinely usable, and a later poll failing (`isError` with
  // `data` still cached) must not relabel a working picker as broken.
  //
  // None of these three wordings makes the control any more functional than it
  // is - it stays `disabled` in all of them, exactly as before.
  const placeholder = !isEmpty
    ? 'Select a server...'
    : isPending
      ? 'Loading servers...'
      : isError
        ? 'Servers unavailable'
        : 'No servers available';

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
      placeholder={placeholder}
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
