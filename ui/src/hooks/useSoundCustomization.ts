import { useState, useCallback } from 'react';

export interface SoundCustomization {
  displayName?: string;
  emoji?: string;
}

type Customizations = Record<string, SoundCustomization>;

const STORAGE_KEY = 'soundCustomizations';

function loadCustomizations(): Customizations {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

function saveToStorage(customizations: Customizations) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(customizations));
}

export function useSoundCustomization() {
  const [customizations, setCustomizations] = useState<Customizations>(loadCustomizations);

  const updateCustomization = useCallback(
    (soundName: string, customization: SoundCustomization) => {
      setCustomizations((prev) => {
        const updated = { ...prev, [soundName]: customization };
        saveToStorage(updated);
        return updated;
      });
    },
    []
  );

  const deleteCustomization = useCallback((soundName: string) => {
    setCustomizations((prev) => {
      const { [soundName]: _, ...rest } = prev;
      saveToStorage(rest);
      return rest;
    });
  }, []);

  const renameCustomization = useCallback((fromName: string, toName: string) => {
    if (fromName === toName) return;
    setCustomizations((prev) => {
      const existing = prev[fromName];
      if (!existing) return prev;
      const { [fromName]: _, ...rest } = prev;
      const updated = { ...rest, [toName]: existing };
      saveToStorage(updated);
      return updated;
    });
  }, []);

  const getCustomization = useCallback(
    (soundName: string): SoundCustomization | undefined => {
      return customizations[soundName];
    },
    [customizations]
  );

  return { customizations, updateCustomization, deleteCustomization, renameCustomization, getCustomization };
}
