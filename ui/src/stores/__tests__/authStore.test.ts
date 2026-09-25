import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '../authStore';

/**
 * `logout()` finished by assigning `buildAuthUrl('/auth/discord')` to
 * `window.location.href` — byte for byte the URL `LoginPage` uses to log IN. So
 * the session was destroyed and the browser was pushed straight back into
 * `passport.authenticate('discord')` on the API origin.
 *
 * The server's own `GET /auth/logout` (apps/raincloud/server/routes/auth.ts)
 * ends with a redirect to `${baseUrl}/`, where `baseUrl` is the dashboard
 * origin — so the client must agree with it and land on the dashboard root,
 * where an unauthenticated `App` renders `LoginPage`.
 */
vi.mock('@/lib/api', () => ({
  authApi: { check: vi.fn(), me: vi.fn(), logout: vi.fn() },
  buildAuthUrl: (path: string) => `https://api.example.test${path}`,
  authBaseUrl: 'https://api.example.test',
}));

const { authApi } = await import('@/lib/api');

let assigned: string[];

beforeEach(() => {
  assigned = [];
  vi.mocked(authApi.logout).mockReset();
  vi.mocked(authApi.logout).mockResolvedValue({} as never);
  useAuthStore.setState({
    user: { id: '1', username: 'connor', discriminator: '0001', avatarUrl: '' },
    isAuthenticated: true,
  });
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: {
      origin: 'https://dash.example.test',
      get href() {
        return 'https://dash.example.test/player';
      },
      set href(value: string) {
        assigned.push(value);
      },
    },
  });
});

describe('authStore.logout', () => {
  it('does not send the user back into the OAuth flow', async () => {
    await useAuthStore.getState().logout();

    expect(assigned.some((url) => url.includes('/auth/discord'))).toBe(false);
  });

  it('lands on the dashboard root, where an unauthenticated App renders the login page', async () => {
    await useAuthStore.getState().logout();

    expect(assigned).toEqual(['/']);
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(useAuthStore.getState().user).toBeNull();
  });

  it('still clears the session and leaves when the logout request fails', async () => {
    vi.mocked(authApi.logout).mockRejectedValue(new Error('network down'));

    await useAuthStore.getState().logout();

    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(assigned).toEqual(['/']);
  });
});
