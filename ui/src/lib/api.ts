import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Auth API
export const authApi = {
  check: () => api.get('/auth/check'),
  me: () => api.get('/auth/me'),
  logout: () => api.post('/auth/logout'),
};

// Bot API
export const botApi = {
  getStatus: () => api.get('/status'),
  getQueue: (guildId: string) => api.get(`/queue/${guildId}`),
  clearQueue: (guildId: string) => api.post(`/queue/${guildId}/clear`),
  removeFromQueue: (guildId: string, index: number) =>
    api.delete(`/queue/${guildId}/${index}`),
};

// Playback API
export const playbackApi = {
  play: (guildId: string, source: string) =>
    api.post('/play', { guildId, source }),
  stop: (guildId: string) => api.post('/stop', { guildId }),
  skip: (guildId: string) => api.post('/skip', { guildId }),
  pause: (guildId: string) => api.post('/pause', { guildId }),
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
  users: (params?: {
    limit?: number;
    guildId?: string;
    startDate?: string;
    endDate?: string;
  }) => api.get('/stats/users', { params }),
  guilds: (params?: {
    limit?: number;
    startDate?: string;
    endDate?: string;
  }) => api.get('/stats/guilds', { params }),
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
};

export default api;

