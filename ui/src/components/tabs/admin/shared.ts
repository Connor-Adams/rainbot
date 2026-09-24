import { useCallback, useSyncExternalStore } from 'react';

/**
 * `runGuildId` crosses a section boundary: `CommandRunner` owns the server
 * dropdown, and `GrokVoiceSettings` keys its conversation-mode / voice /
 * persona queries and mutations off the same selection. It lives here in a
 * tiny module-level store so both sections read one value without duplicating
 * it and without lifting it into the AdminTab shell.
 */
let runGuildId: string | null = null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  return runGuildId;
}

export function useAdminRunGuildId(): [string | null, (next: string | null) => void] {
  const value = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const setValue = useCallback((next: string | null) => {
    if (next === runGuildId) return;
    runGuildId = next;
    listeners.forEach((listener) => listener());
  }, []);
  return [value, setValue];
}
