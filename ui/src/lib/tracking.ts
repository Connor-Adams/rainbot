import { apiBaseUrl, trackingApi } from './api'

const FLUSH_INTERVAL_MS = 5000
const MAX_BATCH_SIZE = 20
const SESSION_TIMEOUT_MS = 30 * 60 * 1000
const SESSION_STORAGE_KEY = 'rainbot.webSession'

type TrackingEvent = {
  eventType: string
  eventTarget?: string | null
  eventValue?: string | null
  guildId?: string | null
  durationMs?: number | null
  webSessionId?: string | null
}

type StoredSession = {
  id: string
  lastSeen: number
}

const queue: TrackingEvent[] = []
let flushTimer: number | null = null
let flushing = false
let initialized = false

function generateSessionId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }

  return `web-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function loadStoredSession(): StoredSession | null {
  if (typeof window === 'undefined') return null

  try {
    const raw = window.localStorage.getItem(SESSION_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as StoredSession
    if (!parsed?.id || !parsed?.lastSeen) return null
    return parsed
  } catch {
    return null
  }
}

function saveStoredSession(session: StoredSession) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session))
  } catch {
    // Ignore storage errors (privacy mode, etc)
  }
}

function getSessionId(): string | null {
  if (typeof window === 'undefined') return null

  const now = Date.now()
  const stored = loadStoredSession()
  if (!stored || now - stored.lastSeen > SESSION_TIMEOUT_MS) {
    const next = { id: generateSessionId(), lastSeen: now }
    saveStoredSession(next)
    return next.id
  }

  const updated = { ...stored, lastSeen: now }
  saveStoredSession(updated)
  return updated.id
}

function ensureInitialized() {
  if (initialized || typeof window === 'undefined') return
  initialized = true

  flushTimer = window.setInterval(() => {
    void flushQueue()
  }, FLUSH_INTERVAL_MS)

  const flushOnHide = () => {
    if (document.visibilityState === 'hidden') {
      void flushQueue(true)
    }
  }

  window.addEventListener('visibilitychange', flushOnHide)
  window.addEventListener('beforeunload', () => {
    void flushQueue(true)
  })
}

async function sendBatch(events: TrackingEvent[], keepalive = false) {
  if (events.length === 0) return

  if (keepalive && typeof fetch !== 'undefined') {
    await fetch(`${apiBaseUrl}/track/batch`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events }),
      keepalive: true,
    })
    return
  }

  await trackingApi.batch(events as Array<Record<string, unknown>>)
}

export async function flushQueue(keepalive = false) {
  if (flushing || queue.length === 0) return
  flushing = true

  const batch = queue.splice(0, MAX_BATCH_SIZE)
  try {
    await sendBatch(batch, keepalive)
  } catch {
    queue.unshift(...batch)
  } finally {
    flushing = false
  }
}

export function trackEvent(event: TrackingEvent) {
  if (typeof window === 'undefined') return
  ensureInitialized()

  const webSessionId = event.webSessionId ?? getSessionId()
  queue.push({
    ...event,
    webSessionId: webSessionId ?? null,
  })

  if (queue.length >= MAX_BATCH_SIZE) {
    void flushQueue()
  }
}

export function trackPageView(page: string, path?: string) {
  trackEvent({
    eventType: 'page_view',
    eventTarget: page,
    eventValue: path ?? window.location.pathname,
  })
}

export function trackApiRequest(
  eventTarget: string,
  status: string,
  durationMs?: number | null
) {
  trackEvent({
    eventType: 'api_request',
    eventTarget,
    eventValue: status,
    durationMs: durationMs ?? null,
  })
}

export function trackClick(eventTarget: string, eventValue?: string) {
  trackEvent({
    eventType: 'click',
    eventTarget,
    eventValue: eventValue ?? null,
  })
}

export function trackTabView(tab: string, parent?: string) {
  trackEvent({
    eventType: 'tab_view',
    eventTarget: tab,
    eventValue: parent ?? null,
  })
}
