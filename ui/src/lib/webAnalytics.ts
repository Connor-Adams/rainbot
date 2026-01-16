import api from './api'

export type WebEventInput = {
  eventType: string
  eventTarget?: string | null
  eventValue?: string | null
  guildId?: string | null
  durationMs?: number | null
}

type WebEventPayload = WebEventInput & { webSessionId: string | null }

const STORAGE_KEY = 'rainbot-web-session-id'
const MAX_BATCH_SIZE = 20
const FLUSH_INTERVAL_MS = 5000

let trackingEnabled = false
let flushTimer: number | null = null
let initialized = false
const eventQueue: WebEventPayload[] = []

function getWebSessionId(): string | null {
  if (typeof window === 'undefined') return null
  if (typeof sessionStorage === 'undefined') return null

  const existing = sessionStorage.getItem(STORAGE_KEY)
  if (existing) return existing

  const newId =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `web-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  sessionStorage.setItem(STORAGE_KEY, newId)
  return newId
}

function scheduleFlush(): void {
  if (flushTimer || eventQueue.length === 0) return

  flushTimer = window.setTimeout(() => {
    flushTimer = null
    flushEvents().catch(() => {
      // ignore errors; will retry on next enqueue
    })
  }, FLUSH_INTERVAL_MS)
}

async function flushEvents(): Promise<void> {
  if (!trackingEnabled || eventQueue.length === 0) return

  const batch = eventQueue.splice(0, MAX_BATCH_SIZE)
  try {
    await api.post('/track/batch', { events: batch })
  } catch (error) {
    eventQueue.unshift(...batch)
  }

  if (eventQueue.length > 0) {
    scheduleFlush()
  }
}

export function initWebAnalytics(): void {
  if (initialized || typeof window === 'undefined') return
  initialized = true

  const flushOnVisibilityChange = () => {
    if (document.visibilityState === 'hidden') {
      flushEvents().catch(() => {
        // ignore
      })
    }
  }

  document.addEventListener('visibilitychange', flushOnVisibilityChange)
  window.addEventListener('beforeunload', () => {
    flushEvents().catch(() => {
      // ignore
    })
  })
}

export function setWebTrackingEnabled(enabled: boolean): void {
  trackingEnabled = enabled
  if (!enabled) {
    eventQueue.length = 0
  }
}

export function trackWebEvent(event: WebEventInput): void {
  if (!trackingEnabled) return

  eventQueue.push({
    eventType: event.eventType,
    eventTarget: event.eventTarget || null,
    eventValue: event.eventValue || null,
    guildId: event.guildId || null,
    durationMs: event.durationMs ?? null,
    webSessionId: getWebSessionId(),
  })

  if (eventQueue.length >= MAX_BATCH_SIZE) {
    flushEvents().catch(() => {
      // ignore
    })
    return
  }

  scheduleFlush()
}
