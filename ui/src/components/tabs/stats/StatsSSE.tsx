import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { buildApiUrl } from '@/lib/api';

export default function StatsSSE() {
  const qc = useQueryClient();

  useEffect(() => {
    let es: EventSource | null = null;
    let reconnect = 1000;
    let pollInterval: number | null = null;

    const startPollingFallback = () => {
      if (pollInterval) return;
      // Poll every 60s as a fallback when SSE can't be established
      pollInterval = window.setInterval(() => {
        qc.invalidateQueries({ queryKey: ['stats'] });
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
        const url = buildApiUrl('/stats/stream');
        es = new EventSource(url);
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
        try {
          JSON.parse(e.data);
          // Invalidate all stats queries when any batch is inserted
          qc.invalidateQueries({ queryKey: ['stats'] });
        } catch {
          qc.invalidateQueries({ queryKey: ['stats'] });
        }
      });

      es.addEventListener('stats-flushed', () => {
        qc.invalidateQueries({ queryKey: ['stats'] });
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
