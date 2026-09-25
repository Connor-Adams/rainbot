import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { createApiEventSource } from '@/lib/api';
import { openLiveStream, queueStream } from './useLiveQuery';

/**
 * Subscribe to SSE queue/now-playing updates for a guild.
 * Only receives events when playback state changes (no heartbeats when idle).
 * Updates React Query cache so the Player tab reflects changes immediately.
 *
 * While the stream is open it also registers itself in `useLiveQuery`'s stream
 * store, which is what suppresses `['queue', guildId]` polling. That cannot be
 * done through the returned `connected` flag: `refetchInterval` is per-observer,
 * so a flag in one component's state left `QueueList` polling on regardless. The
 * flag is still returned for callers that want to *show* stream state.
 */
export function useQueueEvents(guildId: string | null): { connected: boolean } {
  const queryClient = useQueryClient();
  const eventSourceRef = useRef<EventSource | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!guildId) {
      queueMicrotask(() => setConnected(false));
      return;
    }

    const es = createApiEventSource(`queue/${guildId}/events`);
    eventSourceRef.current = es;
    let releaseStream: (() => void) | null = null;

    es.onopen = () => {
      setConnected(true);
      releaseStream ??= openLiveStream(queueStream(guildId));
    };

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
  }, [guildId, queryClient]);

  return { connected };
}
