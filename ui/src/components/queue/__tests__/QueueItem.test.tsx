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
