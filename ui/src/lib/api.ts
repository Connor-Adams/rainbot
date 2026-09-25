import axios from 'axios';

const runtimeConfig =
  (globalThis as { __RAINBOT_CONFIG__?: Record<string, string> }).__RAINBOT_CONFIG__ || {};

const defaultOrigin =
  typeof window !== 'undefined' && window.location?.origin
    ? window.location.origin
    : 'http://localhost:3000';
const defaultApiOrigin = `${defaultOrigin}/api`;
const debugEnabled = import.meta.env.DEV || runtimeConfig['VITE_DEBUG_LOGS'] === 'true';

const currentOrigin =
  typeof window !== 'undefined' && window.location?.origin ? window.location.origin : defaultOrigin;

const resolvedApiBase =
  runtimeConfig['VITE_API_BASE_URL'] || import.meta.env.VITE_API_BASE_URL || '';
export const apiBaseUrl = resolvedApiBase || defaultApiOrigin;

// Auth must hit the backend (OAuth routes). If unset or same as current origin, we'd hit the UI.
const explicitAuthBase =
  runtimeConfig['VITE_AUTH_BASE_URL'] || import.meta.env.VITE_AUTH_BASE_URL || '';
const derivedFromApi = apiBaseUrl.replace(/\/api\/?$/, '').trim() || defaultOrigin;
export const authBaseUrl =
  explicitAuthBase && explicitAuthBase !== currentOrigin ? explicitAuthBase : derivedFromApi;

export function buildAuthUrl(path: string): string {
  const base = authBaseUrl.replace(/\/$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${base}${normalizedPath}`;
}

export function buildApiUrl(path: string): string {
  const base = apiBaseUrl.replace(/\/$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${base}${normalizedPath}`;
}

/**
 * Open an SSE stream against the API, with session cookies attached.
 *
 * `EventSource` defaults to `withCredentials: false`, so a bare
 * `new EventSource(url)` sends no cookies cross-origin. In production the UI
 * and the API are on different hosts (dash.rainbot.win vs api.rainbot.win), so
 * every such stream is rejected by `requireAuth` with a 401. Always create SSE
 * connections through this helper rather than constructing `EventSource`
 * directly.
 */
export function createApiEventSource(path: string): EventSource {
  return new EventSource(buildApiUrl(path), { withCredentials: true });
}

/**
 * Options every *read* endpoint accepts, and the only way an `AbortSignal`
 * reaches Axios.
 *
 * React Query hands its `queryFn` a context carrying a `signal` that it aborts
 * when the query is cancelled — a component unmounting, or a newer fetch
 * superseding this one. Nothing wired that signal into Axios before, so a
 * request outlived the component that asked for it: arrowing across the 21
 * Statistics sections fired ~20 requests and cancelled none of them.
 *
 * **Only read (GET) methods take this.** Mutations deliberately have no
 * parameter to pass a signal through, so a POST/PUT/DELETE that has already
 * reached the server — a command deploy, a transcode sweep, a persona delete —
 * *cannot* be aborted by the component that started it unmounting. That
 * guarantee is enforced by the types here rather than by convention.
 *
 * Reading `context.signal` is also what arms cancellation at all: React Query
 * only aborts a query whose `queryFn` actually touched the signal
 * (`#abortSignalConsumed`). A call site that ignores it stays uncancellable
 * however this layer is written, which is why the signal is threaded explicitly
 * instead of being injected by an interceptor.
 */
export interface ApiReadOptions {
  signal?: AbortSignal | undefined;
}

/**
 * Was this rejection a cancellation rather than a failure?
 *
 * An aborted request is not a fault and must never reach the user as an error
 * panel or a toast; a real failure still must. Axios rejects a cancelled
 * request with `CanceledError` (`code: 'ERR_CANCELED'`), and React Query
 * rejects its own cancellations with a `CancelledError` that carries
 * `silent`/`revert`. Recognise both so neither is mistaken for a server error.
 */
export function isAbortError(error: unknown): boolean {
  if (axios.isCancel(error)) return true;
  if (error instanceof DOMException && error.name === 'AbortError') return true;
  const err = error as { code?: string; name?: string } | null;
  return err?.code === 'ERR_CANCELED' || err?.name === 'CanceledError';
}

/**
 * Query `retry` default: retry a real failure once, an aborted request never.
 *
 * `retry: 1` on its own would treat a cancellation as a failed attempt and
 * re-issue the request we just aborted, which is exactly the traffic
 * cancellation is meant to remove.
 */
export function queryRetry(failureCount: number, error: unknown): boolean {
  if (isAbortError(error)) return false;
  return failureCount < 1;
}

const api = axios.create({
  baseURL: apiBaseUrl,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Auth API - uses root path, not /api (auth routes are at /auth/*, not /api/auth/*)
const authApiClient = axios.create({
  baseURL: authBaseUrl,
  withCredentials: true, // Critical: send cookies with requests for session auth
  headers: {
    'Content-Type': 'application/json',
  },
  // Ensure cookies are sent even on cross-origin requests
  xsrfCookieName: 'XSRF-TOKEN',
  xsrfHeaderName: 'X-XSRF-TOKEN',
});

// Add request interceptor to log cookie info
if (debugEnabled) {
  authApiClient.interceptors.request.use(
    (config) => {
      console.log('[Auth API] Request:', {
        url: config.url,
        method: config.method,
        withCredentials: config.withCredentials,
        cookies: document.cookie ? 'present' : 'missing',
      });
      return config;
    },
    (error) => Promise.reject(error)
  );

  // Add response interceptor for debugging
  authApiClient.interceptors.response.use(
    (response) => {
      console.log('[Auth API] Response:', {
        url: response.config.url,
        status: response.status,
        hasCookies: document.cookie ? 'yes' : 'no',
      });
      return response;
    },
    (error) => {
      console.error('[Auth API] Request failed:', {
        url: error.config?.url,
        method: error.config?.method,
        status: error.response?.status,
        data: error.response?.data,
        message: error.message,
      });
      return Promise.reject(error);
    }
  );
}

// Auth API
export const authApi = {
  check: () => authApiClient.get('/auth/check'),
  me: () => authApiClient.get('/auth/me'),
  logout: () => authApiClient.get('/auth/logout'), // Note: logout is GET, not POST
};

// Bot API
export const botApi = {
  getStatus: ({ signal }: ApiReadOptions = {}) => api.get('/status', { signal }),
  getQueue: (guildId: string, { signal }: ApiReadOptions = {}) =>
    api.get(`/queue/${guildId}`, { signal }),
  clearQueue: (guildId: string) => api.post(`/queue/${guildId}/clear`),
  removeFromQueue: (guildId: string, index: number) => api.delete(`/queue/${guildId}/${index}`),
};

// Playback API
export const playbackApi = {
  play: (guildId: string, source: string) => api.post('/play', { guildId, source }),
  soundboard: (guildId: string, sound: string) => api.post('/soundboard', { guildId, sound }),
  stop: (guildId: string) => api.post('/stop', { guildId }),
  skip: (guildId: string) => api.post('/skip', { guildId }),
  pause: (guildId: string) => api.post('/pause', { guildId }),
  seek: (guildId: string, positionSeconds: number) =>
    api.post('/seek', { guildId, positionSeconds }),
  volume: (guildId: string, level: number, botType?: 'rainbot' | 'pranjeet' | 'hungerbot') =>
    api.post('/volume', { guildId, level, botType }),
  speak: (guildId: string, text: string) => api.post('/speak', { guildId, text }),
  replay: (guildId: string) => api.post('/replay', { guildId }),
  autoplay: (guildId: string, enabled?: boolean) =>
    api.post<{ message: string; enabled: boolean }>('/autoplay', { guildId, enabled }),
};

// Sounds API
export const soundsApi = {
  list: ({ signal }: ApiReadOptions = {}) => api.get('/sounds', { signal }),
  upload: (files: File[]) => {
    const formData = new FormData();
    files.forEach((file) => {
      formData.append('sound', file);
    });
    return api.post('/sounds', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
  },
  delete: (name: string) => api.delete(`/sounds/${encodeURIComponent(name)}`),
  listCustomizations: ({ signal }: ApiReadOptions = {}) =>
    api.get('/sounds/customizations', { signal }),
  setCustomization: (name: string, displayName?: string, emoji?: string) =>
    api.put(`/sounds/${encodeURIComponent(name)}/customization`, { displayName, emoji }),
  deleteCustomization: (name: string) =>
    api.delete(`/sounds/${encodeURIComponent(name)}/customization`),
  sweepTranscode: (options?: { deleteOriginal?: boolean; limit?: number }) =>
    api.post('/sounds/transcode-sweep', options || {}),
  sweepStripVideo: (options?: { dryRun?: boolean; limit?: number }) =>
    api.post<{ stripped: number; archived: number; skipped: number; failed: number }>(
      '/sounds/strip-video-sweep',
      options || {}
    ),
  search: (query: string, { signal }: ApiReadOptions = {}) =>
    api.get('/sounds/search', { params: { q: query, limit: 100 }, signal }),
  analyzeSweep: (options?: { force?: boolean; limit?: number }) =>
    api.post('/sounds/analyze-sweep', options || {}),
  trim: (name: string, startMs: number, endMs: number) =>
    api.post(`/sounds/${encodeURIComponent(name)}/trim`, { startMs, endMs }),
  downloadUrl: (name: string) => buildApiUrl(`/sounds/${encodeURIComponent(name)}/download`),
  previewUrl: (name: string) => buildApiUrl(`/sounds/${encodeURIComponent(name)}/preview`),
};

// Admin API
export const adminApi = {
  deployCommands: () =>
    api.post<{ message: string; count: number; guildId: string | null }>('/deploy-commands'),
  grokChat: (guildId: string, text: string, speakReply?: boolean) =>
    api.post<{ reply: string; message?: string }>('/grok-chat', {
      guildId,
      text,
      speak: !!speakReply,
    }),
  getConversationMode: (guildId: string, { signal }: ApiReadOptions = {}) =>
    api.get<{ enabled: boolean }>(`/conversation-mode/${encodeURIComponent(guildId)}`, { signal }),
  setConversationMode: (guildId: string, enabled: boolean) =>
    api.post<{ enabled: boolean }>('/conversation-mode', { guildId, enabled }),
  getGrokVoice: (guildId: string, { signal }: ApiReadOptions = {}) =>
    api.get<{ voice: string | null }>(`/grok-voice/${encodeURIComponent(guildId)}`, { signal }),
  setGrokVoice: (guildId: string, voice: string) =>
    api.post<{ voice: string }>('/grok-voice', { guildId, voice }),
  getGrokPersona: (guildId: string, { signal }: ApiReadOptions = {}) =>
    api.get<{ personaId: string | null }>(`/grok-persona/${encodeURIComponent(guildId)}`, {
      signal,
    }),
  setGrokPersona: (guildId: string, personaId: string | null) =>
    api.post<{ personaId: string | null }>('/grok-persona', {
      guildId,
      personaId: personaId ?? '',
    }),
  getPersonas: ({ signal }: ApiReadOptions = {}) =>
    api.get<{ personas: { id: string; name: string; isBuiltIn: boolean }[] }>('/personas', {
      signal,
    }),
  getPersona: (id: string, { signal }: ApiReadOptions = {}) =>
    api.get<{
      id: string;
      name: string;
      isBuiltIn: boolean;
      systemPrompt: string | null;
    }>(`/personas/${encodeURIComponent(id)}`, { signal }),
  createPersona: (data: { name: string; systemPrompt: string }) =>
    api.post<{ id: string; name: string }>('/personas', data),
  updatePersona: (id: string, data: { name?: string; systemPrompt?: string }) =>
    api.put<{ id: string; name: string }>(`/personas/${encodeURIComponent(id)}`, data),
  deletePersona: (id: string) => api.delete(`/personas/${encodeURIComponent(id)}`),
};

// Settings API
export const settingsApi = {
  getYoutubeCookies: ({ signal }: ApiReadOptions = {}) =>
    api.get<{ hasCookies: boolean }>('/settings/youtube-cookies', { signal }),
  uploadYoutubeCookies: (file: File) => {
    const formData = new FormData();
    formData.append('cookies', file);
    return api.post<{ message: string }>('/settings/youtube-cookies', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  deleteYoutubeCookies: () => api.delete<{ message: string }>('/settings/youtube-cookies'),
  // proxyUrl comes back with its password redacted; the raw value never leaves
  // the server.
  getYoutubeProxy: ({ signal }: ApiReadOptions = {}) =>
    api.get<{ hasProxy: boolean; proxyUrl: string | null }>('/settings/youtube-proxy', { signal }),
  setYoutubeProxy: (proxyUrl: string) =>
    api.put<{ message: string; proxyUrl: string }>('/settings/youtube-proxy', { proxyUrl }),
  deleteYoutubeProxy: () => api.delete<{ message: string }>('/settings/youtube-proxy'),
};

// Stats API
//
// Every method here is a read, and every one takes its filters and its
// `signal` in the same object: `{ signal, ...params }` destructures the signal
// out before the rest becomes Axios's `params`, so the abort signal can never
// leak into the query string. Call sites read
// `queryFn: ({ signal }) => statsApi.x({ signal })`.
export const statsApi = {
  summary: ({ signal }: ApiReadOptions = {}) => api.get('/stats/summary', { signal }),
  commands: ({
    signal,
    ...params
  }: {
    limit?: number;
    guildId?: string;
    userId?: string;
    startDate?: string;
    endDate?: string;
  } & ApiReadOptions = {}) => api.get('/stats/commands', { params, signal }),
  sounds: ({
    signal,
    ...params
  }: {
    limit?: number;
    guildId?: string;
    userId?: string;
    sourceType?: string;
    isSoundboard?: boolean;
    startDate?: string;
    endDate?: string;
  } & ApiReadOptions = {}) => api.get('/stats/sounds', { params, signal }),
  users: ({
    signal,
    ...params
  }: {
    limit?: number;
    guildId?: string;
    startDate?: string;
    endDate?: string;
  } & ApiReadOptions = {}) => api.get('/stats/users', { params, signal }),
  guilds: ({
    signal,
    ...params
  }: { limit?: number; startDate?: string; endDate?: string } & ApiReadOptions = {}) =>
    api.get('/stats/guilds', { params, signal }),
  queue: ({
    signal,
    ...params
  }: {
    limit?: number;
    guildId?: string;
    operationType?: string;
    startDate?: string;
    endDate?: string;
  } & ApiReadOptions = {}) => api.get('/stats/queue', { params, signal }),
  time: ({
    signal,
    ...params
  }: {
    granularity?: string;
    guildId?: string;
    startDate?: string;
    endDate?: string;
  } & ApiReadOptions = {}) => api.get('/stats/time', { params, signal }),
  history: ({
    signal,
    ...params
  }: {
    userId?: string;
    guildId?: string;
    limit?: number;
    startDate?: string;
    endDate?: string;
  } & ApiReadOptions = {}) => api.get('/stats/history', { params, signal }),
  userSounds: ({
    signal,
    ...params
  }: {
    userId: string;
    guildId?: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
  } & ApiReadOptions) => api.get('/stats/user-sounds', { params, signal }),
  // New stats endpoints
  errors: ({
    signal,
    ...params
  }: { guildId?: string; startDate?: string; endDate?: string } & ApiReadOptions = {}) =>
    api.get('/stats/errors', { params, signal }),
  performance: ({
    signal,
    ...params
  }: {
    guildId?: string;
    commandName?: string;
    startDate?: string;
    endDate?: string;
  } & ApiReadOptions = {}) => api.get('/stats/performance', { params, signal }),
  sessions: ({
    signal,
    ...params
  }: {
    limit?: number;
    guildId?: string;
    startDate?: string;
    endDate?: string;
  } & ApiReadOptions = {}) => api.get('/stats/sessions', { params, signal }),
  retention: ({ signal, ...params }: { guildId?: string } & ApiReadOptions = {}) =>
    api.get('/stats/retention', { params, signal }),
  search: ({
    signal,
    ...params
  }: {
    limit?: number;
    guildId?: string;
    startDate?: string;
    endDate?: string;
  } & ApiReadOptions = {}) => api.get('/stats/search', { params, signal }),
  userSessions: ({
    signal,
    ...params
  }: {
    limit?: number;
    guildId?: string;
    userId?: string;
    startDate?: string;
    endDate?: string;
  } & ApiReadOptions = {}) => api.get('/stats/user-sessions', { params, signal }),
  userTracks: ({
    signal,
    ...params
  }: {
    limit?: number;
    guildId?: string;
    userId?: string;
    startDate?: string;
    endDate?: string;
  } & ApiReadOptions = {}) => api.get('/stats/user-tracks', { params, signal }),
  user: (userId: string, { signal, ...params }: { guildId?: string } & ApiReadOptions = {}) =>
    api.get(`/stats/user/${encodeURIComponent(userId)}`, { params, signal }),
  engagement: ({
    signal,
    ...params
  }: {
    limit?: number;
    guildId?: string;
    startDate?: string;
    endDate?: string;
  } & ApiReadOptions = {}) => api.get('/stats/engagement', { params, signal }),
  interactions: ({
    signal,
    ...params
  }: {
    limit?: number;
    guildId?: string;
    interactionType?: string;
    startDate?: string;
    endDate?: string;
  } & ApiReadOptions = {}) => api.get('/stats/interactions', { params, signal }),
  playbackStates: ({
    signal,
    ...params
  }: {
    guildId?: string;
    stateType?: string;
    startDate?: string;
    endDate?: string;
  } & ApiReadOptions = {}) => api.get('/stats/playback-states', { params, signal }),
  webAnalytics: ({
    signal,
    ...params
  }: {
    limit?: number;
    guildId?: string;
    userId?: string;
    startDate?: string;
    endDate?: string;
  } & ApiReadOptions = {}) => api.get('/stats/web-analytics', { params, signal }),
  guildEvents: ({
    signal,
    ...params
  }: {
    limit?: number;
    eventType?: string;
    startDate?: string;
    endDate?: string;
  } & ApiReadOptions = {}) => api.get('/stats/guild-events', { params, signal }),
  apiLatency: ({
    signal,
    ...params
  }: { endpoint?: string; startDate?: string; endDate?: string } & ApiReadOptions = {}) =>
    api.get('/stats/api-latency', { params, signal }),
};

export default api;
