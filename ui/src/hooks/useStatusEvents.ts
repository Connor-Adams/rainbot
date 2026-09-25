import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { createApiEventSource } from '@/lib/api';
import { STATUS_STREAM, openLiveStream } from './useLiveQuery';

/**
 * Subscribe to SSE bot-status updates (connections, volume).
 * Only receives events when status changes (e.g. volume set); no heartbeats when idle.
 * Updates React Query cache so volume and connection state reflect immediately.
 *
 * While the stream is open it also registers itself in `useLiveQuery`'s stream
 * store, which is what suppresses `['bot-status']` polling. That cannot be done
 * through the returned `connected` flag: `refetchInterval` is per-observer, so a
 * flag in one component's state leaves the key's six other observers polling on.
 * The flag is still returned for callers that want to *show* stream state.
 */
export function useStatusEvents(): { connected: boolean } {
  const queryClient = useQueryClient();
  const eventSourceRef = useRef<EventSource | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const es = createApiEventSource('status/events');
    eventSourceRef.current = es;
    let releaseStream: (() => void) | null = null;

    es.onopen = () => {
      setConnected(true);
      releaseStream ??= openLiveStream(STATUS_STREAM);
    };

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
      releaseStream?.();
      releaseStream = null;
      setConnected(false);
    };

    return () => {
      es.close();
      eventSourceRef.current = null;
      releaseStream?.();
      releaseStream = null;
      setConnected(false);
    };
  }, [queryClient]);

  return { connected };
}
