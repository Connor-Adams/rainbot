import axios from 'axios';

const runtimeConfig =
  (globalThis as { __RAINBOT_CONFIG__?: Record<string, string> }).__RAINBOT_CONFIG__ || {};

export const apiBaseUrl =
  runtimeConfig['VITE_API_BASE_URL'] ||
  import.meta.env.VITE_API_BASE_URL ||
  'http://raincloud.railway.internal:3000/api';
export const authBaseUrl =
  runtimeConfig['VITE_AUTH_BASE_URL'] ||
  import.meta.env.VITE_AUTH_BASE_URL ||
  'http://raincloud.railway.internal:3000';

export function buildAuthUrl(path: string): string {
  const base = authBaseUrl.replace(/\/$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${base}${normalizedPath}`;
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
  volume: (guildId: string, level: number) => api.post('/volume', { guildId, level }),
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
  downloadUrl: (name: string) => `/api/sounds/${encodeURIComponent(name)}/download`,
  previewUrl: (name: string) => `/api/sounds/${encodeURIComponent(name)}/preview`,
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
