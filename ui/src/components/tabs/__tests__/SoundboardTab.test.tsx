import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AxiosError, AxiosHeaders } from 'axios';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import SoundboardTab from '../SoundboardTab';
import { renderWithQuery } from '@/test/renderWithQuery';
import { useGuildStore } from '@/stores/guildStore';

/**
 * A failed `GET /api/sounds` used to render "No sounds uploaded yet — Upload
 * your first sound to get started": the query's `error` was never read, so the
 * error and genuinely-empty screens were pixel-identical and a user with a dead
 * backend was told their library was empty and invited to upload into it.
 *
 * The three states have to stay visibly distinct, so each is asserted for what
 * it shows AND for the other two states' copy that it must not show.
 */
vi.mock('@/lib/api', () => ({
  soundsApi: {
    list: vi.fn(),
    search: vi.fn(),
    listCustomizations: vi.fn(),
    setCustomization: vi.fn(),
    deleteCustomization: vi.fn(),
    upload: vi.fn(),
    delete: vi.fn(),
    trim: vi.fn(),
    sweepTranscode: vi.fn(),
    previewUrl: (name: string) => `/api/sounds/${name}/preview`,
    downloadUrl: (name: string) => `/api/sounds/${name}/download`,
  },
  playbackApi: { soundboard: vi.fn() },
}));

const { soundsApi } = await import('@/lib/api');

const EMPTY_COPY = 'No sounds uploaded yet';
const LOADING_COPY = 'Loading sounds...';

function axiosFailure(status: number): AxiosError {
  const headers = new AxiosHeaders();
  const config = { headers };
  return new AxiosError(
    `Request failed with status code ${status}`,
    AxiosError.ERR_BAD_RESPONSE,
    config,
    {},
    { status, statusText: 'Error', headers: {}, config, data: { error: 'Database unavailable' } }
  );
}

const sound = (name: string) => ({ name, size: 1024, createdAt: '2026-01-01T00:00:00.000Z' });

beforeEach(() => {
  useGuildStore.setState({ selectedGuildId: '1' });
  // `clearMocks` in vitest.config.ts clears call history but leaves a
  // `mockResolvedValueOnce` queue behind, so an unconsumed one-shot from a
  // failing test would decide the NEXT test's data. Reset the one every test
  // arms itself.
  vi.mocked(soundsApi.list).mockReset();
  vi.mocked(soundsApi.listCustomizations).mockResolvedValue({ data: {} } as never);
  vi.mocked(soundsApi.search).mockResolvedValue({ data: { results: [] } } as never);
});

describe('SoundboardTab — failed sounds request', () => {
  it('renders an error, and NOT the empty copy, when the request fails', async () => {
    vi.mocked(soundsApi.list).mockRejectedValue(axiosFailure(500));

    renderWithQuery(<SoundboardTab />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Could not load sounds: Request failed with status code 500');
    expect(screen.queryByText(EMPTY_COPY)).not.toBeInTheDocument();
    expect(screen.queryByText('Upload your first sound to get started')).not.toBeInTheDocument();
    expect(screen.queryByText(LOADING_COPY)).not.toBeInTheDocument();
  });

  it('maps a 403 to written prose rather than the Axios message', async () => {
    vi.mocked(soundsApi.list).mockRejectedValue(axiosFailure(403));

    renderWithQuery(<SoundboardTab />);

    expect(
      await screen.findByText(
        'Access denied — your account lacks the required role to view the soundboard.'
      )
    ).toBeInTheDocument();
    expect(screen.queryByText(/Request failed with status code 403/)).not.toBeInTheDocument();
    expect(screen.queryByText(EMPTY_COPY)).not.toBeInTheDocument();
  });

  it('offers a retry that refetches and clears the error', async () => {
    vi.mocked(soundsApi.list)
      .mockRejectedValueOnce(axiosFailure(500))
      .mockResolvedValueOnce({ data: [sound('airhorn.ogg')] } as never);

    renderWithQuery(<SoundboardTab />);

    await screen.findByRole('alert');
    expect(soundsApi.list).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByRole('button', { name: 'Play airhorn' })).toBeInTheDocument();
    await waitFor(() => expect(soundsApi.list).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('SoundboardTab — the other two states', () => {
  it('still renders the empty copy for a successful empty response', async () => {
    vi.mocked(soundsApi.list).mockResolvedValue({ data: [] } as never);

    renderWithQuery(<SoundboardTab />);

    expect(await screen.findByText(EMPTY_COPY)).toBeInTheDocument();
    expect(screen.getByText('Upload your first sound to get started')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows the loading state, and neither of the other two, while the request is open', () => {
    vi.mocked(soundsApi.list).mockReturnValue(new Promise<never>(() => {}) as never);

    renderWithQuery(<SoundboardTab />);

    expect(screen.getByText(LOADING_COPY)).toBeInTheDocument();
    expect(screen.queryByText(EMPTY_COPY)).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('keeps a loaded list on screen when a later poll fails, with the error above it', async () => {
    // `refetchInterval: 10000` means a single failed poll must not blow away the
    // last good list — React Query keeps `data` and sets `error` at the same
    // time, so the error state is additive here rather than a replacement.
    vi.mocked(soundsApi.list)
      .mockResolvedValueOnce({ data: [sound('airhorn.ogg')] } as never)
      .mockRejectedValue(axiosFailure(500));

    const { queryClient } = renderWithQuery(<SoundboardTab />);

    await screen.findByRole('button', { name: 'Play airhorn' });
    await queryClient.refetchQueries({ queryKey: ['sounds'] });

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Play airhorn' })).toBeInTheDocument();
  });
});

/**
 * `isPlaying` was `playMutation.isPending` handed to EVERY card, so one click
 * lit the whole board: `SoundCard` turns that flag into `animate-pulse` plus a
 * pinging dot, and 60 cards claimed to be playing at once. The mutation already
 * carries which sound it is for, in `variables`.
 */
describe('SoundboardTab — the playing indicator', () => {
  /** Every card, as [accessible name, is it marked playing]. */
  function cardsMarkedPlaying(): [string, boolean][] {
    return screen
      .getAllByRole('button', { name: /^Play / })
      .map((card) => [
        card.getAttribute('aria-label') ?? '',
        card.className.includes('animate-pulse'),
      ]);
  }

  beforeEach(() => {
    vi.mocked(soundsApi.list).mockResolvedValue({
      data: [sound('airhorn.ogg'), sound('bruh.ogg'), sound('wow.ogg')],
    } as never);
  });

  it('marks only the sound that is actually playing', async () => {
    const { playbackApi } = await import('@/lib/api');
    vi.mocked(playbackApi.soundboard).mockReturnValue(new Promise(() => {}) as never);

    renderWithQuery(<SoundboardTab />);

    fireEvent.click(await screen.findByRole('button', { name: 'Play airhorn' }));

    await waitFor(() => expect(playbackApi.soundboard).toHaveBeenCalledTimes(1));
    const marked = cardsMarkedPlaying();
    console.log(
      `CARDS MARKED PLAYING >>> ${JSON.stringify(marked)} | pulse count: ${
        marked.filter(([, isPlaying]) => isPlaying).length
      }`
    );

    expect(marked).toEqual([
      ['Play airhorn', true],
      ['Play bruh', false],
      ['Play wow', false],
    ]);
  });

  it('leaves the other cards clickable while one sound is in flight', async () => {
    const { playbackApi } = await import('@/lib/api');
    vi.mocked(playbackApi.soundboard).mockReturnValue(new Promise(() => {}) as never);

    renderWithQuery(<SoundboardTab />);

    fireEvent.click(await screen.findByRole('button', { name: 'Play airhorn' }));
    await waitFor(() => expect(playbackApi.soundboard).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('button', { name: 'Play bruh' }));
    await waitFor(() => expect(playbackApi.soundboard).toHaveBeenCalledTimes(2));
    expect(vi.mocked(playbackApi.soundboard).mock.calls[1]?.[1]).toBe('bruh.ogg');
  });

  it('still refuses to play anything with no server selected', async () => {
    useGuildStore.setState({ selectedGuildId: null });
    const { playbackApi } = await import('@/lib/api');

    renderWithQuery(<SoundboardTab />);

    const card = await screen.findByRole('button', { name: 'Play airhorn' });
    expect(card).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(card);

    expect(playbackApi.soundboard).not.toHaveBeenCalled();
  });
});
