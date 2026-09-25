import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { User } from '@/types';
import { authApi, buildAuthUrl, authBaseUrl } from '@/lib/api';

const debugEnabled = import.meta.env.DEV;

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  setUser: (user: User | null) => void;
  setAuthenticated: (authenticated: boolean) => void;
  setLoading: (loading: boolean) => void;
  checkAuth: () => Promise<boolean>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      isLoading: true,
      setUser: (user) => set({ user }),
      setAuthenticated: (authenticated) => set({ isAuthenticated: authenticated }),
      setLoading: (loading) => set({ isLoading: loading }),
      checkAuth: async () => {
        set({ isLoading: true });
        const checkUrl = buildAuthUrl('/auth/check');
        console.info('[Auth] checkAuth target:', checkUrl, { authBaseUrl });
        try {
          if (debugEnabled) console.log('[Auth] Checking authentication...');
          const res = await authApi.check();
          const data = res.data;

          if (debugEnabled) {
            console.log('[Auth] Response status:', res.status);
            console.log('[Auth] Response data:', data);
          }

          // No 401/403 check here on purpose: Axios REJECTS a 4xx, so this
          // branch was unreachable and the duplicate check in the `catch` below
          // is the one that has always run.

          // Check if authenticated and has access
          if (data.authenticated && data.hasAccess) {
            if (debugEnabled)
              console.log('[Auth] Authenticated with access, fetching user info...');
            // Fetch user info
            try {
              const userRes = await authApi.me();
              if (debugEnabled) console.log('[Auth] User info:', userRes.data);
              set({
                isAuthenticated: true,
                user: userRes.data,
                isLoading: false,
              });
              return true;
            } catch (error) {
              if (debugEnabled) console.error('[Auth] Failed to fetch user info:', error);
              set({ isAuthenticated: false, user: null, isLoading: false });
              return false;
            }
          }

          // Not authenticated or no access
          if (debugEnabled) console.log('[Auth] Not authenticated or no access');
          set({ isAuthenticated: false, user: null, isLoading: false });
          return false;
        } catch (error) {
          // Handle network errors or other exceptions
          if (debugEnabled) console.error('[Auth] Auth check failed:', error);
          const axiosError = error as { response?: { status?: number; data?: unknown } };
          if (debugEnabled) {
            console.error('[Auth] Error status:', axiosError.response?.status);
            console.error('[Auth] Error data:', axiosError.response?.data);
          }

          // If it's a 401/403, user is not authenticated
          if (axiosError.response?.status === 401 || axiosError.response?.status === 403) {
            if (debugEnabled) console.log('[Auth] Not authenticated (error response 401/403)');
            set({ isAuthenticated: false, user: null, isLoading: false });
            return false;
          }
          // For other errors, still mark as not authenticated
          if (debugEnabled) console.log('[Auth] Other error, marking as not authenticated');
          set({ isAuthenticated: false, user: null, isLoading: false });
          return false;
        }
      },
      logout: async () => {
        try {
          await authApi.logout();
        } catch (error) {
          if (debugEnabled) console.error('Logout error:', error);
        } finally {
          set({ user: null, isAuthenticated: false });
          // The dashboard's own root, NOT `/auth/discord` — that is the URL
          // `LoginPage` uses to log IN (`passport.authenticate('discord')`), so
          // logging out destroyed the session and then pushed the browser
          // straight back into the OAuth flow. This agrees with the server,
          // whose `GET /auth/logout` ends by redirecting to `${baseUrl}/` with
          // `baseUrl` the dashboard origin; an unauthenticated `App` renders
          // `LoginPage` there. A full navigation rather than a router push,
          // because it is also what drops every cached query and store the
          // signed-in session built up.
          window.location.href = '/';
        }
      },
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => localStorage),
      // Only persist user info, not authentication state (always check fresh)
      partialize: (state) => ({ user: state.user }),
    }
  )
);
