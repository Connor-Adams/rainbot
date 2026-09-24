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
  getStatus: () => api.get('/status'),
  getQueue: (guildId: string) => api.get(`/queue/${guildId}`),
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
  list: () => api.get('/sounds'),
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
  listCustomizations: () => api.get('/sounds/customizations'),
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
  search: (query: string) => api.get('/sounds/search', { params: { q: query, limit: 100 } }),
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
  getConversationMode: (guildId: string) =>
    api.get<{ enabled: boolean }>(`/conversation-mode/${encodeURIComponent(guildId)}`),
  setConversationMode: (guildId: string, enabled: boolean) =>
    api.post<{ enabled: boolean }>('/conversation-mode', { guildId, enabled }),
  getGrokVoice: (guildId: string) =>
    api.get<{ voice: string | null }>(`/grok-voice/${encodeURIComponent(guildId)}`),
  setGrokVoice: (guildId: string, voice: string) =>
    api.post<{ voice: string }>('/grok-voice', { guildId, voice }),
  getGrokPersona: (guildId: string) =>
    api.get<{ personaId: string | null }>(`/grok-persona/${encodeURIComponent(guildId)}`),
  setGrokPersona: (guildId: string, personaId: string | null) =>
    api.post<{ personaId: string | null }>('/grok-persona', {
      guildId,
      personaId: personaId ?? '',
    }),
  getPersonas: () =>
    api.get<{ personas: { id: string; name: string; isBuiltIn: boolean }[] }>('/personas'),
  getPersona: (id: string) =>
    api.get<{
      id: string;
      name: string;
      isBuiltIn: boolean;
      systemPrompt: string | null;
    }>(`/personas/${encodeURIComponent(id)}`),
  createPersona: (data: { name: string; systemPrompt: string }) =>
    api.post<{ id: string; name: string }>('/personas', data),
  updatePersona: (id: string, data: { name?: string; systemPrompt?: string }) =>
    api.put<{ id: string; name: string }>(`/personas/${encodeURIComponent(id)}`, data),
  deletePersona: (id: string) => api.delete(`/personas/${encodeURIComponent(id)}`),
};

// Settings API
export const settingsApi = {
  getYoutubeCookies: () => api.get<{ hasCookies: boolean }>('/settings/youtube-cookies'),
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
  getYoutubeProxy: () =>
    api.get<{ hasProxy: boolean; proxyUrl: string | null }>('/settings/youtube-proxy'),
  setYoutubeProxy: (proxyUrl: string) =>
    api.put<{ message: string; proxyUrl: string }>('/settings/youtube-proxy', { proxyUrl }),
  deleteYoutubeProxy: () => api.delete<{ message: string }>('/settings/youtube-proxy'),
};

// Stats API
export const statsApi = {
  summary: () => api.get('/stats/summary'),
  commands: (params?: {
    limit?: number;
    guildId?: string;
    userId?: string;
    startDate?: string;
    endDate?: string;
  }) => api.get('/stats/commands', { params }),
  sounds: (params?: {
    limit?: number;
    guildId?: string;
    userId?: string;
    sourceType?: string;
    isSoundboard?: boolean;
    startDate?: string;
    endDate?: string;
  }) => api.get('/stats/sounds', { params }),
  users: (params?: { limit?: number; guildId?: string; startDate?: string; endDate?: string }) =>
    api.get('/stats/users', { params }),
  guilds: (params?: { limit?: number; startDate?: string; endDate?: string }) =>
    api.get('/stats/guilds', { params }),
  queue: (params?: {
    limit?: number;
    guildId?: string;
    operationType?: string;
    startDate?: string;
    endDate?: string;
  }) => api.get('/stats/queue', { params }),
  time: (params?: {
    granularity?: string;
    guildId?: string;
    startDate?: string;
    endDate?: string;
  }) => api.get('/stats/time', { params }),
  history: (params?: {
    userId?: string;
    guildId?: string;
    limit?: number;
    startDate?: string;
    endDate?: string;
  }) => api.get('/stats/history', { params }),
  userSounds: (params?: {
    userId: string;
    guildId?: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
  }) => api.get('/stats/user-sounds', { params }),
  // New stats endpoints
  errors: (params?: { guildId?: string; startDate?: string; endDate?: string }) =>
    api.get('/stats/errors', { params }),
  performance: (params?: {
    guildId?: string;
    commandName?: string;
    startDate?: string;
    endDate?: string;
  }) => api.get('/stats/performance', { params }),
  sessions: (params?: { limit?: number; guildId?: string; startDate?: string; endDate?: string }) =>
    api.get('/stats/sessions', { params }),
  retention: (params?: { guildId?: string }) => api.get('/stats/retention', { params }),
  search: (params?: { limit?: number; guildId?: string; startDate?: string; endDate?: string }) =>
    api.get('/stats/search', { params }),
  userSessions: (params?: {
    limit?: number;
    guildId?: string;
    userId?: string;
    startDate?: string;
    endDate?: string;
  }) => api.get('/stats/user-sessions', { params }),
  userTracks: (params?: {
    limit?: number;
    guildId?: string;
    userId?: string;
    startDate?: string;
    endDate?: string;
  }) => api.get('/stats/user-tracks', { params }),
  user: (userId: string, params?: { guildId?: string }) =>
    api.get(`/stats/user/${encodeURIComponent(userId)}`, { params }),
  engagement: (params?: {
    limit?: number;
    guildId?: string;
    startDate?: string;
    endDate?: string;
  }) => api.get('/stats/engagement', { params }),
  interactions: (params?: {
    limit?: number;
    guildId?: string;
    interactionType?: string;
    startDate?: string;
    endDate?: string;
  }) => api.get('/stats/interactions', { params }),
  playbackStates: (params?: {
    guildId?: string;
    stateType?: string;
    startDate?: string;
    endDate?: string;
  }) => api.get('/stats/playback-states', { params }),
  webAnalytics: (params?: {
    limit?: number;
    guildId?: string;
    userId?: string;
    startDate?: string;
    endDate?: string;
  }) => api.get('/stats/web-analytics', { params }),
  guildEvents: (params?: {
    limit?: number;
    eventType?: string;
    startDate?: string;
    endDate?: string;
  }) => api.get('/stats/guild-events', { params }),
  apiLatency: (params?: { endpoint?: string; startDate?: string; endDate?: string }) =>
    api.get('/stats/api-latency', { params }),
};

export default api;
