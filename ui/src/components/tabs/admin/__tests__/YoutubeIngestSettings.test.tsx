import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import YoutubeIngestSettings from '../YoutubeIngestSettings';
import { renderWithQuery } from '@/test/renderWithQuery';

/**
 * CHARACTERIZATION TESTS — see the header comment on BotOperations.test.tsx.
 *
 * This is the one admin panel whose controls already carry `aria-label`s, so
 * unlike the others it is queried the way it ought to be queried.
 */

vi.mock('@/lib/api', () => ({
  settingsApi: {
    getYoutubeCookies: vi.fn(),
    uploadYoutubeCookies: vi.fn(),
    deleteYoutubeCookies: vi.fn(),
    getYoutubeProxy: vi.fn(),
    setYoutubeProxy: vi.fn(),
    deleteYoutubeProxy: vi.fn(),
  },
}));

const { settingsApi } = await import('@/lib/api');

function proxyField(): HTMLInputElement {
  return screen.getByLabelText('Proxy URL') as HTMLInputElement;
}

function confirmDialog(label: string) {
  const buttons = screen.getAllByRole('button', { name: label });
  fireEvent.click(buttons[buttons.length - 1]);
}

beforeEach(() => {
  vi.mocked(settingsApi.getYoutubeCookies).mockResolvedValue({
    data: { hasCookies: false },
  } as never);
  vi.mocked(settingsApi.getYoutubeProxy).mockResolvedValue({
    data: { hasProxy: false, proxyUrl: null },
  } as never);
  vi.mocked(settingsApi.setYoutubeProxy).mockResolvedValue({
    data: { message: 'ok', proxyUrl: 'socks5://redacted' },
  } as never);
  vi.mocked(settingsApi.deleteYoutubeProxy).mockResolvedValue({ data: { message: 'ok' } } as never);
  vi.mocked(settingsApi.uploadYoutubeCookies).mockResolvedValue({
    data: { message: 'ok' },
  } as never);
  vi.mocked(settingsApi.deleteYoutubeCookies).mockResolvedValue({
    data: { message: 'ok' },
  } as never);
});

describe('YoutubeIngestSettings — proxy card', () => {
  it('renders the heading and the explanation of why a proxy is needed', () => {
    renderWithQuery(<YoutubeIngestSettings />);

    expect(screen.getByText('YouTube proxy')).toBeInTheDocument();
    expect(screen.getByText(/YouTube blocks requests from datacenter IPs/)).toBeInTheDocument();
  });

  it('labels the field, masks it, and shows the expected format as a placeholder', () => {
    renderWithQuery(<YoutubeIngestSettings />);

    expect(proxyField()).toHaveAttribute('type', 'password');
    expect(proxyField()).toHaveAttribute('placeholder', 'socks5://user:password@host:1080');
    expect(proxyField()).toHaveAttribute('autocomplete', 'off');
    expect(proxyField()).toHaveValue('');
  });

  it('reports no proxy when none is configured, and hides the Remove control', async () => {
    renderWithQuery(<YoutubeIngestSettings />);

    expect(await screen.findByText('No proxy set — going direct')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Remove proxy/ })).not.toBeInTheDocument();
  });

  it('shows the redacted proxy URL and a Remove control when one is configured', async () => {
    vi.mocked(settingsApi.getYoutubeProxy).mockResolvedValue({
      data: { hasProxy: true, proxyUrl: 'socks5://user:***@proxy.example:1080' },
    } as never);
    renderWithQuery(<YoutubeIngestSettings />);

    expect(
      await screen.findByText('✓ Using socks5://user:***@proxy.example:1080')
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove proxy' })).toBeInTheDocument();
  });

  it('keeps Save disabled until the field holds something other than whitespace', () => {
    renderWithQuery(<YoutubeIngestSettings />);
    const save = screen.getByRole('button', { name: 'Save proxy' });

    expect(save).toBeDisabled();

    fireEvent.change(proxyField(), { target: { value: '   ' } });
    expect(save).toBeDisabled();

    fireEvent.change(proxyField(), { target: { value: 'socks5://host:1080' } });
    expect(save).toBeEnabled();
  });

  it('sends the field value UNTRIMMED', async () => {
    // The disabled check trims, the payload does not — so a pasted value with
    // surrounding whitespace is stored with the whitespace. Current behaviour.
    renderWithQuery(<YoutubeIngestSettings />);

    fireEvent.change(proxyField(), { target: { value: '  socks5://host:1080  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save proxy' }));

    await waitFor(() =>
      expect(settingsApi.setYoutubeProxy).toHaveBeenCalledWith('  socks5://host:1080  ')
    );
  });

  it('shows "Saving..." while in flight', async () => {
    vi.mocked(settingsApi.setYoutubeProxy).mockReturnValue(new Promise<never>(() => {}) as never);
    renderWithQuery(<YoutubeIngestSettings />);

    fireEvent.change(proxyField(), { target: { value: 'socks5://host:1080' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save proxy' }));

    expect(await screen.findByRole('button', { name: 'Saving...' })).toBeDisabled();
  });

  it('clears the field and confirms on success', async () => {
    renderWithQuery(<YoutubeIngestSettings />);

    fireEvent.change(proxyField(), { target: { value: 'socks5://host:1080' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save proxy' }));

    expect(
      await screen.findByText('Proxy saved. Rainbot applies it within a few minutes.')
    ).toBeInTheDocument();
    expect(proxyField()).toHaveValue('');
  });

  it('renders the API error body, and falls back to "Failed to save proxy"', async () => {
    vi.mocked(settingsApi.setYoutubeProxy).mockRejectedValueOnce({
      response: { data: { error: 'Unsupported proxy scheme' } },
    });
    renderWithQuery(<YoutubeIngestSettings />);

    fireEvent.change(proxyField(), { target: { value: 'gopher://host' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save proxy' }));

    expect(await screen.findByText('Unsupported proxy scheme')).toBeInTheDocument();
  });

  it('falls back to "Failed to save proxy" when the rejection has no body', async () => {
    // Note: this branch reads only `response.data.error` — a plain Error's
    // `message` is discarded here, unlike everywhere else in these panels.
    vi.mocked(settingsApi.setYoutubeProxy).mockRejectedValueOnce(new Error('Network Error'));
    renderWithQuery(<YoutubeIngestSettings />);

    fireEvent.change(proxyField(), { target: { value: 'socks5://host:1080' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save proxy' }));

    expect(await screen.findByText('Failed to save proxy')).toBeInTheDocument();
    expect(screen.queryByText('Network Error')).not.toBeInTheDocument();
  });

  it('confirms before removing the proxy, and does not remove on cancel', async () => {
    vi.mocked(settingsApi.getYoutubeProxy).mockResolvedValue({
      data: { hasProxy: true, proxyUrl: 'socks5://p' },
    } as never);
    renderWithQuery(<YoutubeIngestSettings />);

    fireEvent.click(await screen.findByRole('button', { name: 'Remove proxy' }));

    expect(await screen.findByText('Remove the YouTube proxy?')).toBeInTheDocument();
    expect(
      screen.getByText('Playback will fall back to direct connections, which may be rate-limited.')
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() =>
      expect(screen.queryByText('Remove the YouTube proxy?')).not.toBeInTheDocument()
    );
    expect(settingsApi.deleteYoutubeProxy).not.toHaveBeenCalled();
  });

  it('removes the proxy on confirm', async () => {
    vi.mocked(settingsApi.getYoutubeProxy).mockResolvedValue({
      data: { hasProxy: true, proxyUrl: 'socks5://p' },
    } as never);
    renderWithQuery(<YoutubeIngestSettings />);

    fireEvent.click(await screen.findByRole('button', { name: 'Remove proxy' }));
    await screen.findByText('Remove the YouTube proxy?');
    confirmDialog('Confirm');

    await waitFor(() => expect(settingsApi.deleteYoutubeProxy).toHaveBeenCalledTimes(1));
  });
});

describe('YoutubeIngestSettings — cookies card', () => {
  function cookiesFileInput(): HTMLInputElement {
    return screen.getByLabelText('Upload cookies file') as HTMLInputElement;
  }

  it('renders the heading and the export instructions', () => {
    renderWithQuery(<YoutubeIngestSettings />);

    expect(screen.getByText('YouTube cookies')).toBeInTheDocument();
    expect(screen.getByText(/Export cookies from your browser/)).toBeInTheDocument();
  });

  it('hides the file input behind a button and restricts it to .txt', () => {
    renderWithQuery(<YoutubeIngestSettings />);

    expect(cookiesFileInput()).toHaveAttribute('type', 'file');
    expect(cookiesFileInput()).toHaveAttribute('accept', '.txt');
    expect(cookiesFileInput()).toHaveClass('hidden');
    expect(screen.getByRole('button', { name: 'Upload cookies (.txt)' })).toBeInTheDocument();
  });

  it('reports no cookies when none are configured, and hides the Remove control', async () => {
    renderWithQuery(<YoutubeIngestSettings />);

    expect(await screen.findByText('No cookies set')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Remove cookies/ })).not.toBeInTheDocument();
  });

  it('reports configured cookies and offers a Remove control', async () => {
    vi.mocked(settingsApi.getYoutubeCookies).mockResolvedValue({
      data: { hasCookies: true },
    } as never);
    renderWithQuery(<YoutubeIngestSettings />);

    expect(await screen.findByText('✓ Cookies configured')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove cookies' })).toBeInTheDocument();
  });

  it('forwards the chosen file to the API and confirms on success', async () => {
    renderWithQuery(<YoutubeIngestSettings />);
    const file = new File(['# Netscape HTTP Cookie File'], 'cookies.txt', { type: 'text/plain' });

    fireEvent.change(cookiesFileInput(), { target: { files: [file] } });

    await waitFor(() => expect(settingsApi.uploadYoutubeCookies).toHaveBeenCalledWith(file));
    expect(
      await screen.findByText('Cookies saved. Rainbot will use them on next startup or fetch.')
    ).toBeInTheDocument();
  });

  it('resets the file input so the same file can be re-picked', async () => {
    renderWithQuery(<YoutubeIngestSettings />);
    const file = new File(['x'], 'cookies.txt', { type: 'text/plain' });

    fireEvent.change(cookiesFileInput(), { target: { files: [file] } });

    await waitFor(() => expect(settingsApi.uploadYoutubeCookies).toHaveBeenCalled());
    expect(cookiesFileInput().value).toBe('');
  });

  it('does nothing when the file picker is dismissed with no selection', () => {
    renderWithQuery(<YoutubeIngestSettings />);

    fireEvent.change(cookiesFileInput(), { target: { files: [] } });

    expect(settingsApi.uploadYoutubeCookies).not.toHaveBeenCalled();
  });

  it('prefers the API error body over the Error message on upload failure', async () => {
    vi.mocked(settingsApi.uploadYoutubeCookies).mockRejectedValueOnce({
      response: { data: { error: 'Not a Netscape cookie file' } },
      message: 'Request failed with status code 400',
    });
    renderWithQuery(<YoutubeIngestSettings />);

    fireEvent.change(cookiesFileInput(), {
      target: { files: [new File(['x'], 'cookies.txt')] },
    });

    expect(await screen.findByText('Not a Netscape cookie file')).toBeInTheDocument();
    expect(screen.queryByText(/status code 400/)).not.toBeInTheDocument();
  });

  it('falls back to "Upload failed" for a bare rejection', async () => {
    vi.mocked(settingsApi.uploadYoutubeCookies).mockRejectedValueOnce({});
    renderWithQuery(<YoutubeIngestSettings />);

    fireEvent.change(cookiesFileInput(), {
      target: { files: [new File(['x'], 'cookies.txt')] },
    });

    expect(await screen.findByText('Upload failed')).toBeInTheDocument();
  });

  it('confirms before removing the cookies, then removes them', async () => {
    vi.mocked(settingsApi.getYoutubeCookies).mockResolvedValue({
      data: { hasCookies: true },
    } as never);
    renderWithQuery(<YoutubeIngestSettings />);

    fireEvent.click(await screen.findByRole('button', { name: 'Remove cookies' }));

    expect(await screen.findByText('Remove the YouTube cookies?')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Age-restricted and members-only videos will stop playing until new cookies are uploaded.'
      )
    ).toBeInTheDocument();

    confirmDialog('Confirm');

    await waitFor(() => expect(settingsApi.deleteYoutubeCookies).toHaveBeenCalledTimes(1));
  });

  it('renders the Error message when the delete fails', async () => {
    vi.mocked(settingsApi.getYoutubeCookies).mockResolvedValue({
      data: { hasCookies: true },
    } as never);
    vi.mocked(settingsApi.deleteYoutubeCookies).mockRejectedValueOnce(new Error('EACCES'));
    renderWithQuery(<YoutubeIngestSettings />);

    fireEvent.click(await screen.findByRole('button', { name: 'Remove cookies' }));
    await screen.findByText('Remove the YouTube cookies?');
    confirmDialog('Confirm');

    expect(await screen.findByText('EACCES')).toBeInTheDocument();
  });
});
