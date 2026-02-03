import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { buildApiUrl } from '@/lib/api';

/**
 * Subscribe to SSE bot-status updates (connections, volume).
 * Only receives events when status changes (e.g. volume set); no heartbeats when idle.
 * Updates React Query cache so volume and connection state reflect immediately.
 * Returns connection status so callers can reduce polling when SSE is active.
 */
export function useStatusEvents(): { connected: boolean } {
  const queryClient = useQueryClient();
  const eventSourceRef = useRef<EventSource | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const url = buildApiUrl('status/events');
    const es = new EventSource(url);
    eventSourceRef.current = es;

    es.onopen = () => setConnected(true);

    es.onmessage = (event: MessageEvent) => {
      try {
        const payload = JSON.parse(event.data as string) as { event?: string; data?: unknown };
        if (payload.event === 'status' && payload.data != null) {
          queryClient.setQueryData(['bot-status'], payload.data);
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
  }, [queryClient]);

  return { connected };
}
