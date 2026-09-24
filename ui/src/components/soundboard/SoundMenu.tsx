import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '@connor-adams/designsystem';
import { soundsApi } from '@/lib/api';

interface SoundMenuProps {
  /** The trigger button that opened this menu - used to position and to return focus on close. */
  anchorEl: HTMLElement;
  soundName: string;
  isPreviewing: boolean;
  onPreview: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onClose: () => void;
}

const MENU_GAP = 6;
const VIEWPORT_MARGIN = 8;

/**
 * Sound options menu. Rendered in a portal to `document.body` and positioned
 * from the trigger's `getBoundingClientRect()` (`position: fixed`) so it is
 * never clipped by the sounds grid's own scroll container, and stays glued to
 * the trigger as either the grid or the page scrolls.
 */
export function SoundMenu({
  anchorEl,
  soundName,
  isPreviewing,
  onPreview,
  onEdit,
  onDelete,
  onClose,
}: SoundMenuProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  const updatePosition = useCallback(() => {
    const menuEl = containerRef.current;
    if (!menuEl) return;
    const anchorRect = anchorEl.getBoundingClientRect();
    const menuRect = menuEl.getBoundingClientRect();

    // Prefer opening below, right-aligned to the trigger - matches the old
    // `absolute right-0 top-full` placement - then clamp/flip so it never
    // runs off the viewport.
    let left = anchorRect.right - menuRect.width;
    left = Math.min(left, window.innerWidth - menuRect.width - VIEWPORT_MARGIN);
    left = Math.max(VIEWPORT_MARGIN, left);

    let top = anchorRect.bottom + MENU_GAP;
    if (top + menuRect.height > window.innerHeight - VIEWPORT_MARGIN) {
      const above = anchorRect.top - MENU_GAP - menuRect.height;
      top =
        above >= VIEWPORT_MARGIN
          ? above
          : Math.max(VIEWPORT_MARGIN, window.innerHeight - menuRect.height - VIEWPORT_MARGIN);
    }

    setPosition({ top, left });
  }, [anchorEl]);

  // Measure after the menu has rendered off-screen, then place it for real.
  useLayoutEffect(() => {
    updatePosition();
  }, [updatePosition]);

  // Keep the menu glued to its trigger. `scroll` doesn't bubble, but a
  // capture-phase window listener still sees it fire on any descendant
  // scroll container (the sounds grid included).
  useEffect(() => {
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);
    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [updatePosition]);

  // Close on outside click. A click on the trigger itself is ignored here -
  // its own onClick already toggles the menu closed, and treating it as an
  // "outside" click too would immediately reopen it.
  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (containerRef.current?.contains(target)) return;
      if (anchorEl.contains(target)) return;
      onClose();
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [anchorEl, onClose]);

  // Move focus into the menu on open, and back to the trigger on close -
  // covers Escape, outside click, and item selection, since all of them
  // unmount this component. Deferred to the next frame because the click
  // that opened the menu also gives the trigger button native browser focus
  // *after* this effect would otherwise run, which silently wins the race
  // and leaves focus stuck on the trigger.
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      const firstItem = containerRef.current?.querySelector<HTMLElement>('[role="menuitem"]');
      firstItem?.focus();
    });
    return () => {
      cancelAnimationFrame(raf);
      anchorEl.focus();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const items = Array.from(
      containerRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []
    );
    if (items.length === 0) return;
    const currentIndex = items.indexOf(document.activeElement as HTMLElement);
    const nextIndex =
      event.key === 'ArrowDown'
        ? (currentIndex + 1) % items.length
        : (currentIndex - 1 + items.length) % items.length;
    items[nextIndex]?.focus();
  };

  const itemClasses =
    'w-full px-4 py-2.5 text-left text-sm text-text-primary hover:bg-surface-hover flex items-center gap-2 transition-colors focus:outline-none focus-visible:bg-surface-hover';

  return createPortal(
    <div
      ref={containerRef}
      role="menu"
      aria-label={`${soundName} options`}
      className="fixed z-[900] bg-surface-elevated border border-border rounded-lg shadow-xl min-w-[150px] overflow-hidden"
      style={{
        top: position?.top ?? -9999,
        left: position?.left ?? -9999,
        visibility: position ? 'visible' : 'hidden',
      }}
      onKeyDown={handleKeyDown}
      onClick={(e) => e.stopPropagation()}
    >
      <button type="button" role="menuitem" className={itemClasses} onClick={onPreview}>
        <Icon name={isPreviewing ? 'pause' : 'play'} size={16} />
        <span>{isPreviewing ? 'Stop' : 'Preview'}</span>
      </button>

      <button type="button" role="menuitem" className={itemClasses} onClick={onEdit}>
        <Icon name="pencil" size={16} />
        <span>Customize</span>
      </button>

      <a
        href={soundsApi.downloadUrl(soundName)}
        download={soundName}
        role="menuitem"
        className={itemClasses}
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
      >
        <Icon name="download" size={16} />
        <span>Download</span>
      </a>

      <div className="border-t border-border" role="separator" />

      <button
        type="button"
        role="menuitem"
        className="w-full px-4 py-2.5 text-left text-sm text-danger-light hover:bg-danger/10 flex items-center gap-2 transition-colors focus:outline-none focus-visible:bg-danger/10"
        onClick={onDelete}
      >
        <Icon name="trash" size={16} />
        <span>Delete</span>
      </button>
    </div>,
    document.body
  );
}
