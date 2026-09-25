import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import { useState } from 'react';
import { useKeyboardShortcuts, type KeyboardShortcut } from '../useKeyboardShortcuts';

/**
 * Two defects in one hook.
 *
 * (5) The input-bail refused *every* shortcut whose `event.target` was an
 * `INPUT`/`TEXTAREA`/contenteditable. It exists so that typing `s` into a search
 * box does not fire a single-letter shortcut, which is right — but Escape is not
 * text, and the only place a user presses Escape to clear a search is inside the
 * field. `SoundboardTab` registers Escape to close the menu, clear the search and
 * stop the preview, and that shortcut could never fire from the search box.
 *
 * (6) The effect's deps were `[shortcuts, enabled]`, and the one call site passes
 * an inline array literal — a new identity every render — so the window listener
 * was torn down and re-added on every unrelated re-render.
 */

function Harness({
  shortcuts,
  enabled,
  renderCount = 0,
}: {
  shortcuts: KeyboardShortcut[];
  enabled?: boolean;
  renderCount?: number;
}) {
  useKeyboardShortcuts(shortcuts, enabled);
  return (
    <div>
      <input aria-label="search" data-testid="search" />
      <textarea aria-label="notes" data-testid="notes" />
      <span data-testid="renders">{renderCount}</span>
    </div>
  );
}

/** Mirrors the real call site: a fresh array literal on every render. */
function InlineLiteralHarness({ onEscape }: { onEscape: () => void }) {
  const [tick, setTick] = useState(0);
  useKeyboardShortcuts([{ key: 'Escape', handler: onEscape }]);
  return (
    <button data-testid="rerender" onClick={() => setTick(tick + 1)}>
      {tick}
    </button>
  );
}

function press(target: Element | Document, key: string, init: KeyboardEventInit = {}) {
  act(() => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...init }));
  });
}

let addSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  addSpy = vi.spyOn(window, 'addEventListener');
});

afterEach(() => {
  addSpy.mockRestore();
});

const keydownSubscribes = () =>
  addSpy.mock.calls.filter(([type]: unknown[]) => type === 'keydown').length;

describe('useKeyboardShortcuts inside a text field', () => {
  it('fires Escape dispatched from a focused input', () => {
    const handler = vi.fn();
    const { getByTestId } = render(<Harness shortcuts={[{ key: 'Escape', handler }]} />);

    press(getByTestId('search'), 'Escape');

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('fires Escape dispatched from a focused textarea', () => {
    const handler = vi.fn();
    const { getByTestId } = render(<Harness shortcuts={[{ key: 'Escape', handler }]} />);

    press(getByTestId('notes'), 'Escape');

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('still suppresses a single-character shortcut typed into an input', () => {
    const handler = vi.fn();
    const { getByTestId } = render(<Harness shortcuts={[{ key: 's', handler }]} />);

    press(getByTestId('search'), 's');
    expect(handler).not.toHaveBeenCalled();

    press(document, 's');
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('suppresses Enter inside an input unless the shortcut opts in', () => {
    const plain = vi.fn();
    const optedIn = vi.fn();
    const { getByTestId, unmount } = render(
      <Harness shortcuts={[{ key: 'Enter', handler: plain }]} />
    );
    press(getByTestId('search'), 'Enter');
    expect(plain).not.toHaveBeenCalled();
    unmount();

    const second = render(
      <Harness shortcuts={[{ key: 'Enter', handler: optedIn, allowInInput: true }]} />
    );
    press(second.getByTestId('search'), 'Enter');
    expect(optedIn).toHaveBeenCalledTimes(1);
  });

  it('suppresses a printable shortcut inside an input even with an opt-out-shaped key', () => {
    const handler = vi.fn();
    const { getByTestId } = render(<Harness shortcuts={[{ key: '/', handler }]} />);

    press(getByTestId('search'), '/');
    expect(handler).not.toHaveBeenCalled();
  });
});

describe('useKeyboardShortcuts subscription stability', () => {
  it('subscribes once across unrelated re-renders', () => {
    const shortcuts: KeyboardShortcut[] = [{ key: 'Escape', handler: vi.fn() }];
    const { rerender } = render(<Harness shortcuts={shortcuts} renderCount={0} />);

    const afterMount = keydownSubscribes();

    rerender(<Harness shortcuts={shortcuts} renderCount={1} />);
    rerender(<Harness shortcuts={shortcuts} renderCount={2} />);
    rerender(<Harness shortcuts={shortcuts} renderCount={3} />);

    expect({ afterMount, afterRerenders: keydownSubscribes() }).toEqual({
      afterMount: 1,
      afterRerenders: 1,
    });
  });

  it('subscribes once even when the call site passes a fresh array literal', () => {
    const onEscape = vi.fn();
    const { getByTestId } = render(<InlineLiteralHarness onEscape={onEscape} />);

    const afterMount = keydownSubscribes();
    for (let i = 0; i < 3; i++) {
      act(() => {
        getByTestId('rerender').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
    }

    expect({ afterMount, afterRerenders: keydownSubscribes() }).toEqual({
      afterMount: 1,
      afterRerenders: 1,
    });
  });

  it('uses the latest handler without re-subscribing', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = render(<Harness shortcuts={[{ key: 'Escape', handler: first }]} />);

    rerender(<Harness shortcuts={[{ key: 'Escape', handler: second }]} />);
    press(document, 'Escape');

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
    expect(keydownSubscribes()).toBe(1);
  });

  it('does not listen at all while disabled, and listens once when enabled', () => {
    const handler = vi.fn();
    const { rerender } = render(
      <Harness shortcuts={[{ key: 'Escape', handler }]} enabled={false} />
    );

    press(document, 'Escape');
    expect(handler).not.toHaveBeenCalled();
    expect(keydownSubscribes()).toBe(0);

    rerender(<Harness shortcuts={[{ key: 'Escape', handler }]} enabled={true} />);
    press(document, 'Escape');
    expect(handler).toHaveBeenCalledTimes(1);
    expect(keydownSubscribes()).toBe(1);
  });
});
