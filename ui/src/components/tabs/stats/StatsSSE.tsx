import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { createApiEventSource } from '@/lib/api';
import { invalidateAllStats, invalidateForStatsUpdate } from './statsInvalidation';

export default function StatsSSE() {
  const qc = useQueryClient();

  useEffect(() => {
    let es: EventSource | null = null;
    let reconnect = 1000;
    let pollInterval: number | null = null;

    const startPollingFallback = () => {
      if (pollInterval) return;
      // Poll every 60s as a fallback when SSE can't be established.
      //
      // Stays a blanket invalidation on purpose. With no stream there is no
      // discriminator to narrow by, and it is cheap: `invalidateQueries` only
      // refetches queries that have observers, and the Statistics tab mounts
      // exactly one section at a time — so this costs one request a minute, not
      // 21. What it does beyond each section's own `refetchInterval` is mark the
      // *unmounted* sections stale, which is the only way they pick up changes
      // made while the stream was down.
      pollInterval = window.setInterval(() => {
        invalidateAllStats(qc);
      }, 60_000);
    };

    const stopPollingFallback = () => {
      if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
      }
    };

    const connect = () => {
      try {
        es = createApiEventSource('/stats/stream');
      } catch {
        es = null;
      }

      if (!es) {
        // If we couldn't create an EventSource, start polling and exit
        startPollingFallback();
        return;
      }

      // If EventSource connects, ensure polling fallback is stopped
      stopPollingFallback();

      es.addEventListener('stats-update', (e: MessageEvent) => {
        invalidateForStatsUpdate(qc, e.data as string);
      });

      // `stats-flushed` carries only `{ ts }` — no discriminator, and none is
      // available: it fires from `flushAll()`, which ends every active voice
      // session (writing `voice_sessions` directly) and then drains all 13
      // buffers. "Everything may have changed" is the literal truth here, so
      // this one stays broad.
      es.addEventListener('stats-flushed', () => {
        invalidateAllStats(qc);
      });

      es.onopen = () => {
        reconnect = 1000;
      };

      es.onerror = () => {
        // attempt reconnect with backoff; if repeated failures occur, fall back to polling
        if (es) {
          es.close();
          es = null;
        }
        // After a few failed attempts, use polling fallback to ensure UI updates
        if (reconnect >= 8000) {
          startPollingFallback();
          return;
        }
        setTimeout(connect, reconnect);
        reconnect = Math.min(30000, reconnect * 2);
      };
    };

    connect();

    return () => {
      if (es) {
        es.close();
        es = null;
      }
      stopPollingFallback();
    };
  }, [qc]);

  return null;
}
