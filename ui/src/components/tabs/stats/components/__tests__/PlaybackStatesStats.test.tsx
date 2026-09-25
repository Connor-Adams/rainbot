import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import PlaybackStatesStats from '../PlaybackStatesStats';
import { renderWithQuery } from '@/test/renderWithQuery';

/**
 * Both bar sections divided by `Math.max(...counts.map(Number))` with no `, 1`
 * floor and no `safeInt` — unlike `TimeStats` and `RetentionStats`, which both
 * have it. One row missing its `count` made the whole `Math.max` `NaN`, so every
 * bar in the section computed `n / NaN * 100` and collapsed to 0%, and the
 * missing row printed a literal `NaN` as its value text. An all-zero response
 * gave `0 / 0` for the same reason.
 *
 * `Progress` is the design system's bar: `aria-valuenow` carries the computed
 * percentage and `aria-valuetext` the count, which is what these assert on —
 * recharts is not involved and no layout measurement is needed.
 */
vi.mock('@/lib/api', () => ({
  statsApi: { playbackStates: vi.fn() },
}));

const { statsApi } = await import('@/lib/api');

beforeEach(() => {
  vi.mocked(statsApi.playbackStates).mockReset();
});

/** Each case below populates exactly one section, so every bar on screen is its. */
function barValues() {
  return screen.getAllByRole('progressbar').map((el) => ({
    now: el.getAttribute('aria-valuenow'),
    text: el.getAttribute('aria-valuetext'),
  }));
}

describe('PlaybackStatesStats bar scaling', () => {
  it('keeps the other bars scaled when one row has no count', async () => {
    vi.mocked(statsApi.playbackStates).mockResolvedValue({
      data: {
        stateTypes: [
          { state_type: 'play', count: '40' },
          { state_type: 'pause', count: '12' },
          // A row the server produced without a `count` — this is what made
          // `Math.max` NaN and flattened every bar in the section.
          { state_type: 'skip' },
        ],
        volumeDistribution: [],
        pausePatternByHour: [],
      },
    } as never);

    renderWithQuery(<PlaybackStatesStats />);

    await waitFor(() => expect(screen.getAllByRole('progressbar')).toHaveLength(3));
    expect(barValues()).toEqual([
      { now: '100', text: '40' },
      { now: '30', text: '12' },
      { now: '0', text: '0' },
    ]);
  });

  it('never prints NaN as a value', async () => {
    vi.mocked(statsApi.playbackStates).mockResolvedValue({
      data: {
        stateTypes: [{ state_type: 'play', count: '40' }, { state_type: 'skip' }],
        volumeDistribution: [{ volume_level: 50, count: undefined as unknown as string }],
        pausePatternByHour: [{ hour: '13', pauses: undefined as unknown as string, resumes: '4' }],
      },
    } as never);

    renderWithQuery(<PlaybackStatesStats />);

    await waitFor(() => expect(screen.getByText('play')).toBeInTheDocument());
    expect(document.body.textContent).not.toMatch(/NaN/);
    for (const el of screen.getAllByRole('progressbar')) {
      expect(el.getAttribute('aria-valuenow')).not.toBe('NaN');
      expect(el.getAttribute('aria-valuetext') ?? '').not.toMatch(/NaN/);
    }
  });

  it('does not divide by zero when every count is zero', async () => {
    vi.mocked(statsApi.playbackStates).mockResolvedValue({
      data: {
        stateTypes: [
          { state_type: 'play', count: '0' },
          { state_type: 'pause', count: '0' },
        ],
        volumeDistribution: [],
        pausePatternByHour: [],
      },
    } as never);

    renderWithQuery(<PlaybackStatesStats />);

    await waitFor(() => expect(screen.getAllByRole('progressbar')).toHaveLength(2));
    for (const el of screen.getAllByRole('progressbar')) {
      expect(el.getAttribute('aria-valuenow')).toBe('0');
      expect(el.getAttribute('aria-valuetext')).toBe('0');
    }
  });

  it('scales the volume bars against the section maximum', async () => {
    vi.mocked(statsApi.playbackStates).mockResolvedValue({
      data: {
        stateTypes: [],
        volumeDistribution: [
          { volume_level: 50, count: '10' },
          { volume_level: 80, count: '5' },
        ],
        pausePatternByHour: [],
      },
    } as never);

    renderWithQuery(<PlaybackStatesStats />);

    await waitFor(() => expect(screen.getAllByRole('progressbar')).toHaveLength(2));
    const [first, second] = screen.getAllByRole('progressbar');
    expect(first.getAttribute('aria-valuenow')).toBe('100');
    expect(second.getAttribute('aria-valuenow')).toBe('50');
  });
});
