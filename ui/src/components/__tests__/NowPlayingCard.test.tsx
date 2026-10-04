import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, screen } from '@testing-library/react';
import NowPlayingCard from '../NowPlayingCard';
import { renderWithQuery } from '@/test/renderWithQuery';

/**
 * The card used to tick from 0 the moment the worker picked a track, while the
 * worker only started its clock once audio flowed 4+ seconds later. The first
 * real position then landed behind the bar and it jumped back. While the worker
 * reports the track as buffering, the bar has to hold still.
 */
vi.mock('@/lib/api', () => ({
  playbackApi: { pause: vi.fn(), skip: vi.fn(), seek: vi.fn(), replay: vi.fn() },
}));

const nowPlaying = {
  kind: 'music',
  title: 'Palm Tree Escape',
  url: 'https://youtu.be/x',
  durationMs: 120000,
};

afterEach(() => {
  vi.useRealTimers();
});

describe('NowPlayingCard progress', () => {
  it('holds at 0:00 while the track is still buffering', () => {
    vi.useFakeTimers();
    renderWithQuery(
      <NowPlayingCard
        guildId="1"
        queueData={{ nowPlaying: nowPlaying as never, queue: [], isBuffering: true }}
      />
    );

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(screen.queryByText('0:05')).toBeNull();
    expect(screen.getAllByText('0:00').length).toBeGreaterThan(0);
  });

  it('ticks once audio is playing', () => {
    vi.useFakeTimers();
    renderWithQuery(
      <NowPlayingCard
        guildId="1"
        queueData={{ nowPlaying: nowPlaying as never, queue: [], positionMs: 0 }}
      />
    );

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(screen.getAllByText('0:05').length).toBeGreaterThan(0);
  });
});
