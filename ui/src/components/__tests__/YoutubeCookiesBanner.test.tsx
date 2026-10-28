import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import YoutubeCookiesBanner from '../YoutubeCookiesBanner';
import { renderWithQuery } from '@/test/renderWithQuery';

vi.mock('@/lib/api', () => ({
  settingsApi: { getYoutubeCookies: vi.fn() },
}));

const { settingsApi } = await import('@/lib/api');

function renderBanner() {
  return renderWithQuery(
    <MemoryRouter>
      <YoutubeCookiesBanner />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.mocked(settingsApi.getYoutubeCookies).mockReset();
});

describe('YoutubeCookiesBanner', () => {
  it('stays hidden while YouTube accepts the cookies', async () => {
    vi.mocked(settingsApi.getYoutubeCookies).mockResolvedValue({
      data: { hasCookies: true, stale: false, staleSince: null },
    } as never);

    renderBanner();

    await waitFor(() => expect(settingsApi.getYoutubeCookies).toHaveBeenCalled());
    expect(screen.queryByText('YouTube cookies need a refresh')).toBeNull();
  });

  it('asks for new cookies and links to the upload panel once they are rejected', async () => {
    vi.mocked(settingsApi.getYoutubeCookies).mockResolvedValue({
      data: { hasCookies: true, stale: true, staleSince: '2026-10-28T10:00:00.000Z' },
    } as never);

    renderBanner();

    expect(await screen.findByText('YouTube cookies need a refresh')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Upload new cookies' }).getAttribute('href')).toBe(
      '/admin?section=youtube'
    );
  });
});
