import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface GuildState {
  selectedGuildId: string | null;
  setSelectedGuildId: (guildId: string | null) => void;
}

export const useGuildStore = create<GuildState>()(
  persist(
    (set) => ({
      selectedGuildId: null,
      setSelectedGuildId: (guildId) => set({ selectedGuildId: guildId }),
    }),
    {
      name: 'guild-storage',
      storage: createJSONStorage(() => localStorage),
    }
  )
);
