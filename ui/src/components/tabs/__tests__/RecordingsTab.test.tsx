import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import RecordingsTab from '../RecordingsTab';

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
