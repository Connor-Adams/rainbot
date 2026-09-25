import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import QueueItem from '../QueueItem';
import type { Track } from '@/types';

/**
 * Regression cover for the double-escaping bug.
 *
 * `QueueItem` used to pass every appearance of `track.title` through
 * `escapeHtml()` from `@/lib/utils`, which HTML-escaped the string
 * (`div.textContent = text; return div.innerHTML`). React then escapes text
 * children and attribute values itself, so the entities reached the screen
 * literally: `Simon & Garfunkel` rendered as `Simon &amp; Garfunkel`, and the
 * `title` tooltip and the remove button's accessible name carried the same
 * `&amp;` / `&lt;` noise.
 *
 * The proof it was the helper and not the data: `NowPlayingCard` renders the
 * same title correctly, because it never called `escapeHtml`.
 *
 * All four appearances are asserted — the visible text, the `title` ATTRIBUTE
 * (a tooltip, not a text child) and the button's `aria-label` plus its
 * screen-reader-only span — because the two non-text-child sites are affected
 * exactly the same way and were equally wrong.
 *
 * The fixture also carries Cyrillic and an emoji: `textContent`/`innerHTML`
 * round-tripping leaves those alone, so they pin that removing the helper did
 * not regress non-ASCII rendering either.
 */
const TRICKY_TITLE = 'Simon & Garfunkel - Mrs. Robinson <live> "Привет" 🎵';

function makeTrack(overrides: Partial<Track> = {}): Track {
  return { title: TRICKY_TITLE, url: 'https://example.com/track', duration: 245, ...overrides };
}

describe('QueueItem', () => {
  it('renders an ampersand and angle brackets in the title verbatim, not as HTML entities', () => {
    render(<QueueItem track={makeTrack()} index={0} onRemove={vi.fn()} />);

    // `getByText` with an exact string match fails outright on
    // `Simon &amp; Garfunkel ...`, which is what the old helper produced.
    expect(screen.getByText(TRICKY_TITLE)).toBeInTheDocument();
    expect(screen.queryByText(/&amp;|&lt;|&gt;|&quot;/)).not.toBeInTheDocument();
  });

  it('puts the unescaped title in the `title` tooltip attribute', () => {
    render(<QueueItem track={makeTrack()} index={0} onRemove={vi.fn()} />);

    expect(screen.getByTitle(TRICKY_TITLE)).toHaveTextContent(TRICKY_TITLE);
  });

  it('names the remove button with the unescaped title', () => {
    render(<QueueItem track={makeTrack()} index={0} onRemove={vi.fn()} />);

    expect(
      screen.getByRole('button', { name: `Remove ${TRICKY_TITLE} from queue` })
    ).toBeInTheDocument();
  });

  it('keeps the screen-reader-only label unescaped too', () => {
    const { container } = render(<QueueItem track={makeTrack()} index={0} onRemove={vi.fn()} />);

    const srOnly = container.querySelector('.sr-only');
    expect(srOnly).not.toBeNull();
    expect(srOnly).toHaveTextContent(`Remove ${TRICKY_TITLE} from queue`);
  });

  it('still falls back to "Unknown" for a track with no title', () => {
    render(<QueueItem track={makeTrack({ title: undefined })} index={0} onRemove={vi.fn()} />);

    expect(screen.getByTitle('Unknown')).toHaveTextContent('Unknown');
    expect(screen.getByRole('button', { name: 'Remove Unknown from queue' })).toBeInTheDocument();
  });
});

/**
 * `MediaItem` carries BOTH `duration` (seconds) and `durationMs` (milliseconds)
 * and both are optional, so a producer that fills in only the ms field left the
 * queue row with no duration at all.
 *
 * Which one does the worker actually send? `apps/rainbot/src/voice/trackFetcher.ts`
 * builds every queue item from play-dl's `durationInSec`, and `buildQueueState`
 * in `apps/rainbot/src/state/guild-state.ts` passes `state.queue` through
 * untouched — so today the queue always carries `duration`, and `durationMs` is
 * only ever set on `PlaybackState`/`QueueState` (the now-playing progress bar).
 * The gap is therefore latent rather than visible on the rainbot path, but both
 * fields are in the shared contract, so both are handled here.
 *
 * The unit difference is the whole risk: read as seconds, 245000 ms would
 * render as 68 hours, and read as ms, 245 s would render as a quarter second.
 * Both fixtures below describe the same 4:05 track through the two fields, and
 * both must produce the same string.
 */
describe('QueueItem duration', () => {
  it('renders a duration given only `duration` in seconds', () => {
    render(<QueueItem track={makeTrack({ duration: 245 })} index={0} onRemove={vi.fn()} />);

    expect(screen.getByText('4:05')).toBeInTheDocument();
  });

  it('renders the same duration given only `durationMs` in milliseconds', () => {
    render(
      <QueueItem
        track={makeTrack({ duration: undefined, durationMs: 245_000 })}
        index={0}
        onRemove={vi.fn()}
      />
    );

    expect(screen.getByText('4:05')).toBeInTheDocument();
  });

  it('prefers `duration` when both are present', () => {
    render(
      <QueueItem
        track={makeTrack({ duration: 245, durationMs: 999_000 })}
        index={0}
        onRemove={vi.fn()}
      />
    );

    expect(screen.getByText('4:05')).toBeInTheDocument();
    expect(screen.queryByText('16:39')).not.toBeInTheDocument();
  });

  it('rounds a millisecond duration to whole seconds', () => {
    render(
      <QueueItem
        track={makeTrack({ duration: undefined, durationMs: 245_678 })}
        index={0}
        onRemove={vi.fn()}
      />
    );

    expect(screen.getByText('4:06')).toBeInTheDocument();
  });

  it('shows no duration at all when neither field is set', () => {
    render(<QueueItem track={makeTrack({ duration: undefined })} index={0} onRemove={vi.fn()} />);

    expect(screen.queryByText(/^\d+:\d{2}$/)).not.toBeInTheDocument();
  });
});

/**
 * The entry animation's delay was `index * 0.05s` with no ceiling. The queue
 * polls, so every refresh re-mounts the rows and replays the animation: at the
 * 25 tracks the sidebar routinely holds, the last row only finished appearing
 * 1.25s after the first, and the whole list visibly rippled on each poll.
 *
 * The stagger is kept for the first few rows (that is the effect it was for)
 * and clamped from there, so the cost of a long queue is bounded.
 */
describe('QueueItem entry stagger', () => {
  function delayOf(index: number) {
    const { container } = render(
      <QueueItem track={makeTrack()} index={index} onRemove={vi.fn()} />
    );
    return (container.firstElementChild as HTMLElement).style.animationDelay;
  }

  it('still staggers the first rows', () => {
    expect(delayOf(0)).toBe('0ms');
    expect(delayOf(3)).toBe('150ms');
  });

  it('caps the delay so a long queue does not ripple', () => {
    expect(delayOf(24)).toBe('300ms');
    expect(delayOf(100)).toBe('300ms');
  });
});
