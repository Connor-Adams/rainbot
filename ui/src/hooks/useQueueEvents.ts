import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { buildApiUrl } from '@/lib/api';

/**
 * Subscribe to SSE queue/now-playing updates for a guild.
 * Only receives events when playback state changes (no heartbeats when idle).
 * Updates React Query cache so the Player tab reflects changes immediately.
 * Returns connection status so callers can reduce polling when SSE is active.
 */
export function useQueueEvents(guildId: string | null): { connected: boolean } {
  const queryClient = useQueryClient();
  const eventSourceRef = useRef<EventSource | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!guildId) {
      setConnected(false);
      return;
    }

    const url = buildApiUrl(`queue/${guildId}/events`);
    const es = new EventSource(url);
    eventSourceRef.current = es;

    es.onopen = () => setConnected(true);

    es.onmessage = (event: MessageEvent) => {
      try {
        const payload = JSON.parse(event.data as string) as { event?: string; data?: unknown };
        if (payload.event === 'queue' && payload.data != null) {
          queryClient.setQueryData(['queue', guildId], payload.data);
        }
      } catch {
        // Ignore parse errors
      }
    };

    es.onerror = () => {
      es.close();
      eventSourceRef.current = null;
      setConnected(false);
    };

    return () => {
      es.close();
      eventSourceRef.current = null;
      setConnected(false);
    };
  }, [guildId, queryClient]);

  return { connected };
}
