import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import StatsSummary from '../StatsSummary';
import { renderWithQuery } from '@/test/renderWithQuery';

/**
 * Behaviour cover for the tile row that `STAT_VALUE_CLAMP` was threaded through:
 * the constant was an empty string, so removing it changes nothing on screen,
 * and this pins that. The clamping its comment described lives in
 * `common/StatCard.tsx` and applies to every tile without any call-site opt-in.
 */
vi.mock('@/lib/api', () => ({
  statsApi: { summary: vi.fn() },
}));

const { statsApi } = await import('@/lib/api');

beforeEach(() => {
  vi.mocked(statsApi.summary).mockReset();
  vi.mocked(statsApi.summary).mockResolvedValue({
    data: {
      totalCommands: 184922,
      totalSounds: 90210,
      uniqueUsers: 1284,
      uniqueGuilds: 37,
      successRate: 99.42,
    },
  } as never);
});

describe('StatsSummary', () => {
  it('renders all five tiles with grouped values', async () => {
    renderWithQuery(<StatsSummary />);

    expect(await screen.findByText('184,922')).toBeInTheDocument();
    expect(screen.getByText('90,210')).toBeInTheDocument();
    expect(screen.getByText('1,284')).toBeInTheDocument();
    expect(screen.getByText('37')).toBeInTheDocument();
    expect(screen.getByText('99.4%')).toBeInTheDocument();
  });

  it('clamps every tile value without a per-call-site class', async () => {
    const { container } = renderWithQuery(<StatsSummary />);

    await screen.findByText('184,922');

    const tiles = container.querySelectorAll('.ca-stat-card');
    expect(tiles).toHaveLength(5);
    tiles.forEach((tile) => {
      expect(tile.className).toContain('[&_p]:overflow-hidden');
    });
  });
});
