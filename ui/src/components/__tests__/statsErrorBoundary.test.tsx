import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { StatsErrorBoundary } from '../ErrorBoundary';
import StatisticsTab from '@/components/tabs/stats/StatisticsTab';
import { renderWithQuery } from '@/test/renderWithQuery';

/**
 * One throwing Statistics section used to wedge all 21 until a full page reload.
 *
 * Two independent faults produced that: `StatsErrorBoundary` passed a STATIC
 * `fallback`, which `ErrorBoundary.render` returns before it ever reaches
 * `DefaultErrorFallback`, so the panel had no "Try Again"; and `StatisticsTab`
 * did not key the boundary on the active section, so `hasError` survived every
 * tab switch. `RouteErrorBoundary`, in the same file, already had both halves
 * right — it offers a retry and `Layout` keys it on the pathname.
 *
 * A render-phase throw is all it takes: one malformed number in one payload.
 */
function Boom(): never {
  throw new Error('section exploded');
}

/**
 * Throws while `shouldThrow` is set. A "throw on first render only" component
 * does NOT work here: React recovers a concurrent render-phase throw by
 * re-rendering the root synchronously, so the second render would already be the
 * healthy one and the boundary would never engage.
 */
let shouldThrow = true;
function Flaky() {
  if (shouldThrow) throw new Error('section exploded');
  return <div>healthy section</div>;
}

// Render-phase throws are noisy by design; React logs the caught error and the
// boundaries log their own. Silence both so a passing run is readable.
beforeEach(() => {
  shouldThrow = true;
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('StatsErrorBoundary', () => {
  it('offers an in-app retry rather than only telling the user to reload', () => {
    render(
      <StatsErrorBoundary>
        <Boom />
      </StatsErrorBoundary>
    );

    expect(screen.getByRole('button', { name: 'Try Again' })).toBeInTheDocument();
  });

  it('re-renders the children when that retry is pressed', () => {
    render(
      <StatsErrorBoundary>
        <Flaky />
      </StatsErrorBoundary>
    );

    expect(screen.getByText('Statistics Unavailable')).toBeInTheDocument();

    shouldThrow = false;
    fireEvent.click(screen.getByRole('button', { name: 'Try Again' }));

    expect(screen.getByText('healthy section')).toBeInTheDocument();
    expect(screen.queryByText('Statistics Unavailable')).not.toBeInTheDocument();
  });

  it('still says statistics are unavailable, not the generic wording', () => {
    render(
      <StatsErrorBoundary>
        <Boom />
      </StatsErrorBoundary>
    );

    expect(screen.getByText('Statistics Unavailable')).toBeInTheDocument();
    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument();
  });
});

vi.mock('@/lib/api', () => ({
  statsApi: { summary: vi.fn(), commands: vi.fn() },
  botApi: { getStatus: vi.fn() },
  createApiEventSource: () => {
    throw new Error('no SSE in tests');
  },
}));

// The section under the "Summary" pill throws on render; the one under
// "Commands" is healthy. Everything else is irrelevant to the switch.
vi.mock('@/components/tabs/stats/components/StatsSummary', () => ({
  default: () => {
    throw new Error('malformed summary payload');
  },
}));
vi.mock('@/components/tabs/stats/components/CommandsStats', () => ({
  default: () => <div>commands section</div>,
}));

describe('StatisticsTab — one broken section', () => {
  it('clears the error when the user switches to a section that works', async () => {
    renderWithQuery(<StatisticsTab />);

    expect(screen.getByText('Statistics Unavailable')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Commands' }));

    expect(await screen.findByText('commands section')).toBeInTheDocument();
    expect(screen.queryByText('Statistics Unavailable')).not.toBeInTheDocument();
  });
});
