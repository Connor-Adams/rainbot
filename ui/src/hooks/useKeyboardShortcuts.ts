import { useEffect, useRef } from 'react';

export interface KeyboardShortcut {
  key: string;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
  handler: () => void;
  description?: string;
  /**
   * Let this shortcut fire while the user is typing in a text field.
   *
   * Only needed for keys that a text field legitimately owns — `Enter`, `Tab`,
   * the arrows — where the hook cannot know whether the field or the shortcut
   * should win. `Escape` needs no opt-in; see `KEYS_ALLOWED_IN_TEXT_FIELDS`.
   */
  allowInInput?: boolean;
}

/**
 * Keys that reach a shortcut even from inside a text field.
 *
 * The rule the input-bail below is really after is **"does this keystroke belong
 * to the text field?"**, not "is the target an input". A printable character does
 * belong to it — that is why the bail exists, so typing `s` in a search box does
 * not fire a single-letter shortcut. `Escape` never enters, deletes or navigates
 * text; in a field it means "dismiss", and dismissing is exactly what a shortcut
 * bound to it wants to do. `SoundboardTab` binds Escape to clear the search, and
 * the only place a user presses Escape to clear a search is inside the field —
 * so with a blanket bail that shortcut could never fire at all.
 *
 * Deliberately an allowlist rather than a `key.length > 1` test: `Enter`, `Tab`,
 * `Backspace`, `Home` and the arrows are all multi-character *and* owned by the
 * field, so that test would hand the field's own editing keys to shortcuts. Those
 * cases use `allowInInput` instead, which makes the trade-off explicit at the
 * call site.
 */
const KEYS_ALLOWED_IN_TEXT_FIELDS = new Set(['escape']);

function isTextEntryTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (!element) return false;
  return element.tagName === 'INPUT' || element.tagName === 'TEXTAREA' || element.isContentEditable;
}

export function useKeyboardShortcuts(shortcuts: KeyboardShortcut[], enabled = true) {
  /**
   * The live shortcut list, read at event time rather than closed over.
   *
   * The effect used to depend on `[shortcuts, enabled]`, and every call site
   * passes an inline array literal — a new identity on every render — so the
   * window listener was removed and re-added on each unrelated re-render (the
   * soundboard's 10s poll churned it steadily). Keeping the array in a ref means
   * the subscription depends only on `enabled` while still dispatching to the
   * newest handlers, so no call site has to memoise anything.
   *
   * The assignment lives in its own dep-less effect rather than in the render
   * body because `react-hooks/refs` (correctly) forbids writing a ref during
   * render. The handler only ever reads `.current` from an event, which is always
   * after effects have flushed, so it never sees a stale list.
   */
  const shortcutsRef = useRef(shortcuts);
  useEffect(() => {
    shortcutsRef.current = shortcuts;
  });

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      const shortcut = shortcutsRef.current.find(
        (s) =>
          s.key.toLowerCase() === event.key.toLowerCase() &&
          !!s.ctrlKey === event.ctrlKey &&
          !!s.shiftKey === event.shiftKey &&
          !!s.altKey === event.altKey &&
          !!s.metaKey === event.metaKey
      );

      if (!shortcut) return;

      // Don't steal keystrokes the text field the user is typing in owns.
      if (
        isTextEntryTarget(event.target) &&
        !shortcut.allowInInput &&
        !KEYS_ALLOWED_IN_TEXT_FIELDS.has(shortcut.key.toLowerCase())
      ) {
        return;
      }

      event.preventDefault();
      shortcut.handler();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enabled]);
}
