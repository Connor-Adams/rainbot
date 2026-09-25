import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import RecordingsTab from '../RecordingsTab';
import { useGuildStore } from '@/stores/guildStore';

/**
 * A failed `GET /api/recordings` used to be a four-second toast and nothing
 * else: after it expired the user sat on "No voice recordings yet" with no
 * trace that anything had failed.
 *
 * This tab uses raw `fetch`, not the Axios client, so `window.fetch` is what
 * gets stubbed here and its errors carry no Axios response — the 403 case below
 * is what pins the status onto the thrown Error so the mapped prose is reachable
 * at all.
 */
const EMPTY_COPY = 'No voice recordings yet';
const GUILD_ID = '123456789012345678';
const LOADING_COPY = 'Loading recordings...';

const recording = (name: string) => ({
  name,
  size: 2048,
  createdAt: '2026-01-01T00:00:00.000Z',
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  useGuildStore.setState({ selectedGuildId: GUILD_ID });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('RecordingsTab — failed recordings request', () => {
  it('renders an error, and NOT the empty copy, when the request fails', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'Database unavailable' }, 500));

    render(<RecordingsTab />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Error: Failed to load recordings (HTTP 500)');
    expect(screen.queryByText(EMPTY_COPY)).not.toBeInTheDocument();
    expect(
      screen.queryByText('Enable voice commands and speak to create recordings')
    ).not.toBeInTheDocument();
    expect(screen.queryByText(LOADING_COPY)).not.toBeInTheDocument();
  });

  it('maps a 403 to written prose even though a raw fetch has no Axios error', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'Access denied' }, 403));

    render(<RecordingsTab />);

    expect(
      await screen.findByText(
        'Access denied — your account lacks the required role to view recordings.'
      )
    ).toBeInTheDocument();
    expect(screen.queryByText(EMPTY_COPY)).not.toBeInTheDocument();
  });

  it('offers a retry that refetches and clears the error', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ error: 'Database unavailable' }, 500))
      .mockResolvedValueOnce(jsonResponse([recording('2026-01-01-connor.ogg')]));

    render(<RecordingsTab />);

    await screen.findByRole('alert');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByText('2026-01-01-connor.ogg')).toBeInTheDocument();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('RecordingsTab — the other two states', () => {
  it('still renders the empty copy for a successful empty response', async () => {
    fetchMock.mockResolvedValue(jsonResponse([]));

    render(<RecordingsTab />);

    expect(await screen.findByText(EMPTY_COPY)).toBeInTheDocument();
    expect(
      screen.getByText('Enable voice commands and speak to create recordings')
    ).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows the loading state, and neither of the other two, while the request is open', () => {
    fetchMock.mockReturnValue(new Promise<never>(() => {}));

    render(<RecordingsTab />);

    expect(screen.getByText(LOADING_COPY)).toBeInTheDocument();
    expect(screen.queryByText(EMPTY_COPY)).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('keeps a loaded list on screen when a later refresh fails, with the error above it', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse([recording('2026-01-01-connor.ogg')]))
      .mockResolvedValueOnce(jsonResponse({ error: 'Database unavailable' }, 503));

    render(<RecordingsTab />);

    await screen.findByText('2026-01-01-connor.ogg');
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Error: Failed to load recordings (HTTP 503)'
    );
    expect(screen.getByText('2026-01-01-connor.ogg')).toBeInTheDocument();
  });
});

/**
 * `POST /api/play` reads `{ guildId, source }` (apps/raincloud/server/routes/api.ts)
 * and 400s with "guildId and source are required" if either is missing. This tab
 * sent `{ sound: 'records/<name>' }` — wrong key, and no guild at all, because it
 * never read `useGuildStore` — so the Play button had never once reached playback.
 */
describe('RecordingsTab — the Play button', () => {
  /** Route the two endpoints this tab talks to; `play` decides what POST /play does. */
  function stubEndpoints({
    play = jsonResponse({ message: 'Playing' }),
  }: { play?: Response } = {}) {
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/play')) return Promise.resolve(play);
      return Promise.resolve(jsonResponse([recording('rec1.ogg')]));
    });
  }

  /** The body of the one POST /play call. */
  function playBody(): unknown {
    const call = fetchMock.mock.calls.find(([input]) => String(input).includes('/play'));
    if (!call) throw new Error('no POST /api/play was issued');
    return JSON.parse((call[1] as RequestInit).body as string);
  }

  it('posts the selected guild and the `source` key the route reads', async () => {
    stubEndpoints();

    render(<RecordingsTab />);
    fireEvent.click(await screen.findByRole('button', { name: 'Play' }));

    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([input]) => String(input).includes('/play'))).toBe(true)
    );
    expect(playBody()).toEqual({ guildId: GUILD_ID, source: 'records/rec1.ogg' });
  });

  it('does not fire a request that cannot succeed when no guild is selected', async () => {
    useGuildStore.setState({ selectedGuildId: null });
    stubEndpoints();

    render(<RecordingsTab />);
    const play = await screen.findByRole('button', { name: 'Play' });

    expect(play).toBeDisabled();
    fireEvent.click(play);

    await waitFor(() => expect(screen.getByText('No server selected')).toBeInTheDocument());
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes('/play'))).toBe(false);
  });

  it("surfaces the server's explanation rather than a generic failure", async () => {
    stubEndpoints({ play: jsonResponse({ error: 'Bot is not in a voice channel' }, 409) });

    render(<RecordingsTab />);
    fireEvent.click(await screen.findByRole('button', { name: 'Play' }));

    expect(await screen.findByText(/Bot is not in a voice channel/)).toBeInTheDocument();
    expect(screen.queryByText(/Failed to play recording/)).not.toBeInTheDocument();
  });

  it("prefers the route's 403 wording over a status-mapped guess", async () => {
    // `requireGuildMember` 403s with "Not a member of this guild" — far more
    // use than StatsError's generic role sentence, so the play path must not
    // annotate the status and let the mapping win.
    stubEndpoints({ play: jsonResponse({ error: 'Not a member of this guild' }, 403) });

    render(<RecordingsTab />);
    fireEvent.click(await screen.findByRole('button', { name: 'Play' }));

    expect(await screen.findByText(/Not a member of this guild/)).toBeInTheDocument();
    expect(screen.queryByText(/lacks the required role/)).not.toBeInTheDocument();
  });
});
