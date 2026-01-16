import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { trackWebEvent } from '@/lib/webAnalytics';

interface GuildState {
  selectedGuildId: string | null;
  setSelectedGuildId: (guildId: string | null) => void;
}

export const useGuildStore = create<GuildState>()(
  persist(
    (set) => ({
      selectedGuildId: null,
      setSelectedGuildId: (guildId) => {
        trackWebEvent({
          eventType: 'guild_select',
          eventTarget: guildId || 'none',
          guildId: guildId || undefined,
        })
        set({ selectedGuildId: guildId })
      },
    }),
    {
      name: 'guild-storage',
      storage: createJSONStorage(() => localStorage),
    }
  )
);
