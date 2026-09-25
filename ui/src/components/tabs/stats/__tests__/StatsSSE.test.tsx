import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from '@testing-library/react';
import StatsSSE from '../StatsSSE';
import { renderWithQuery } from '@/test/renderWithQuery';

/**
 * `es.onerror` scheduled its reconnect with a bare `setTimeout(connect, reconnect)`
 * and never stored the handle, so the effect's cleanup had nothing to clear. Leave
 * the Statistics tab inside the 1–8s backoff window after any stream blip and the
 * timer still fires: `connect()` builds a brand-new `EventSource` for a component
 * that no longer exists, and nothing ever closes it — one connection held for the
 * life of the page, per occurrence.
 */
vi.mock('@/lib/api', () => ({
  createApiEventSource: vi.fn(),
}));

const { createApiEventSource } = await import('@/lib/api');

interface FakeEventSource {
  closed: boolean;
  onopen: (() => void) | null;
  onerror: (() => void) | null;
  addEventListener: ReturnType<typeof vi.fn>;
  close: () => void;
}

let streams: FakeEventSource[] = [];

function makeStream(): FakeEventSource {
  const stream: FakeEventSource = {
    closed: false,
    onopen: null,
    onerror: null,
    addEventListener: vi.fn(),
    close() {
      this.closed = true;
    },
  };
  streams.push(stream);
  return stream;
}

const openStreams = () => streams.filter((s) => !s.closed);

beforeEach(() => {
  streams = [];
  vi.useFakeTimers();
  vi.mocked(createApiEventSource).mockReset();
  vi.mocked(createApiEventSource).mockImplementation(() => makeStream() as unknown as EventSource);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('StatsSSE teardown', () => {
  it('leaves no open stream when it unmounts inside the reconnect backoff', () => {
    const { unmount } = renderWithQuery(<StatsSSE />);

    expect(streams).toHaveLength(1);

    // A stream blip arms the 1s reconnect.
    act(() => {
      streams[0].onerror?.();
    });
    expect(openStreams()).toHaveLength(0);

    // The user navigates off the Statistics tab before the backoff elapses.
    unmount();
    act(() => {
      vi.advanceTimersByTime(1500);
    });

    expect(openStreams()).toHaveLength(0);
    expect(createApiEventSource).toHaveBeenCalledTimes(1);
  });

  it('still reconnects while it is mounted', () => {
    renderWithQuery(<StatsSSE />);

    act(() => {
      streams[0].onerror?.();
    });
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(createApiEventSource).toHaveBeenCalledTimes(2);
    expect(openStreams()).toHaveLength(1);
  });

  it('clears the 60s polling fallback and the pending reconnect together', () => {
    const { unmount, queryClient } = renderWithQuery(<StatsSSE />);
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

    // Back the stream off past 8s so the polling fallback starts instead.
    for (let i = 0; i < 5; i++) {
      act(() => {
        streams[streams.length - 1].onerror?.();
        vi.advanceTimersByTime(30_000);
      });
    }

    invalidate.mockClear();
    unmount();
    act(() => {
      vi.advanceTimersByTime(180_000);
    });

    expect(invalidate).not.toHaveBeenCalled();
    expect(openStreams()).toHaveLength(0);
  });
});
