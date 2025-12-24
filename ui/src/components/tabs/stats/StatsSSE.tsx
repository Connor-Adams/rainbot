import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'

export default function StatsSSE() {
  const qc = useQueryClient()

  useEffect(() => {
    let es: EventSource | null = null
    let reconnect = 1000

    const connect = () => {
      try {
        es = new EventSource('/api/stats/stream')
      } catch (e) {
        es = null
      }

      if (!es) return

      es.addEventListener('stats-update', (e: MessageEvent) => {
        try {
          const payload = JSON.parse(e.data)
          // Invalidate all stats queries when any batch is inserted
          qc.invalidateQueries(['stats'])
        } catch (err) {
          qc.invalidateQueries(['stats'])
        }
      })

      es.addEventListener('stats-flushed', () => {
        qc.invalidateQueries(['stats'])
      })

      es.onopen = () => {
        reconnect = 1000
      }

      es.onerror = () => {
        // attempt reconnect with backoff
        if (es) {
          es.close()
          es = null
        }
        setTimeout(connect, reconnect)
        reconnect = Math.min(30000, reconnect * 2)
      }
    }

    connect()

    return () => {
      if (es) {
        es.close()
        es = null
      }
    }
    // only mount once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return null
}
