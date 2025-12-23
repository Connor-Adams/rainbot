import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { User } from '@/types';
import { authApi } from '@/lib/api';

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
        try {
          console.log('[Auth] Checking authentication...');
          const res = await authApi.check();
          const data = res.data;
          
          console.log('[Auth] Response status:', res.status);
          console.log('[Auth] Response data:', data);
          
          // Handle error responses (401/403)
          if (res.status === 401 || res.status === 403) {
            console.log('[Auth] Not authenticated (401/403)');
            set({ isAuthenticated: false, user: null, isLoading: false });
            return false;
          }

          // Check if authenticated and has access
          if (data.authenticated && data.hasAccess) {
            console.log('[Auth] Authenticated with access, fetching user info...');
            // Fetch user info
            try {
              const userRes = await authApi.me();
              console.log('[Auth] User info:', userRes.data);
              set({
                isAuthenticated: true,
                user: userRes.data,
                isLoading: false,
              });
              return true;
            } catch (error) {
              console.error('[Auth] Failed to fetch user info:', error);
              set({ isAuthenticated: false, user: null, isLoading: false });
              return false;
            }
          }

          // Not authenticated or no access
          console.log('[Auth] Not authenticated or no access');
          set({ isAuthenticated: false, user: null, isLoading: false });
          return false;
        } catch (error) {
          // Handle network errors or other exceptions
          console.error('[Auth] Auth check failed:', error);
          const axiosError = error as { response?: { status?: number; data?: unknown } };
          console.error('[Auth] Error status:', axiosError.response?.status);
          console.error('[Auth] Error data:', axiosError.response?.data);
          
          // If it's a 401/403, user is not authenticated
          if (axiosError.response?.status === 401 || axiosError.response?.status === 403) {
            console.log('[Auth] Not authenticated (error response 401/403)');
            set({ isAuthenticated: false, user: null, isLoading: false });
            return false;
          }
          // For other errors, still mark as not authenticated
          console.log('[Auth] Other error, marking as not authenticated');
          set({ isAuthenticated: false, user: null, isLoading: false });
          return false;
        }
      },
      logout: async () => {
        try {
          await authApi.logout();
        } catch (error) {
          console.error('Logout error:', error);
        } finally {
          set({ user: null, isAuthenticated: false });
          window.location.href = '/auth/discord';
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

