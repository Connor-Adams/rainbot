import { trackingApi } from './api'

const SESSION_KEY = 'rainbot:web-session'

function getWebSessionId(): string {
  if (typeof window === 'undefined') return 'server'
  const stored = window.sessionStorage.getItem(SESSION_KEY)
  if (stored) return stored
  const fallback = `web-${Date.now()}-${Math.random().toString(36).slice(2)}`
  const sessionId =
    typeof window.crypto?.randomUUID === 'function' ? window.crypto.randomUUID() : fallback
  window.sessionStorage.setItem(SESSION_KEY, sessionId)
  return sessionId
}

export async function trackWebEvent(payload: {
  eventType: string
  eventTarget?: string | null
  eventValue?: string | null
  guildId?: string | null
  durationMs?: number | null
}): Promise<void> {
  try {
    await trackingApi.trackEvent({
      eventType: payload.eventType,
      eventTarget: payload.eventTarget ?? null,
      eventValue: payload.eventValue ?? null,
      guildId: payload.guildId ?? null,
      durationMs: payload.durationMs ?? null,
      webSessionId: getWebSessionId(),
    })
  } catch {
    // Ignore tracking failures to avoid interrupting UI flows
  }
}

export async function trackPageView(payload: {
  page: string
  guildId?: string | null
  durationMs?: number | null
  context?: string | null
}): Promise<void> {
  await trackWebEvent({
    eventType: 'page_view',
    eventTarget: payload.page,
    eventValue: payload.context ?? null,
    guildId: payload.guildId ?? null,
    durationMs: payload.durationMs ?? null,
  })
}
