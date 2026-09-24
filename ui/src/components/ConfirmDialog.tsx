import { useEffect, useRef } from 'react';
import { Button, Dialog } from '@connor-adams/designsystem';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: React.ReactNode;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  /**
   * Where to send focus when the dialog closes and the control that opened it
   * is no longer in the document — a successful "Remove proxy" / "Remove
   * cookies" / "Delete persona" unmounts its own trigger, and focusing a
   * detached node silently drops focus to `<body>`.
   */
  restoreFocusRef?: React.RefObject<HTMLElement | null>;
}

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * Thin wrapper over the DS `Dialog` for confirming an irreversible action.
 *
 * This is a *gate*, not a progress indicator: confirming runs `onConfirm` and
 * the dialog goes away immediately. Each call site closes itself at confirm
 * time, so progress and errors surface inline in the section (where they are
 * rendered, and where they are actually visible) instead of behind the scrim.
 * Keeping the dialog up until the mutation settled froze the whole dashboard
 * behind an undismissable modal for the length of a synchronous batch job.
 *
 * `Dialog` already closes on Escape and scrim click (it calls `onClose`) and
 * owns all of that layout/scrim behaviour — this wrapper does not reimplement
 * it, it just points `onClose` at `onCancel` so both gestures always cancel,
 * never confirm. What `Dialog` does *not* do is manage focus: it neither moves
 * focus into itself on open, nor contains focus while open (it renders inline,
 * with no portal and nothing marking the rest of the page inert, so Tab would
 * otherwise walk straight out into the page behind), nor restores focus on
 * close. This wrapper does all three.
 */
export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  onConfirm,
  onCancel,
  restoreFocusRef,
}: ConfirmDialogProps) {
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (open) {
      // Remember whatever had focus (the control that opened this dialog) and
      // move focus to Cancel — the safe default — once the dialog has mounted.
      wasOpenRef.current = true;
      triggerRef.current = document.activeElement as HTMLElement | null;
      const frame = window.requestAnimationFrame(() => cancelButtonRef.current?.focus());
      return () => window.cancelAnimationFrame(frame);
    }

    // Restore focus on close. Done here rather than in the open branch's
    // cleanup so `restoreFocusRef.current` is read at the moment it is needed.
    if (!wasOpenRef.current) return;
    wasOpenRef.current = false;

    const trigger = triggerRef.current;
    triggerRef.current = null;

    // The trigger may already be gone (a confirmed delete unmounts it);
    // `.focus()` on a detached node is a no-op that leaves focus on `<body>`.
    if (trigger?.isConnected) {
      trigger.focus();
      return;
    }
    const fallback = restoreFocusRef?.current;
    if (fallback?.isConnected) fallback.focus();
  }, [open, restoreFocusRef]);

  // Contain Tab within the dialog for as long as it is open.
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const content = contentRef.current;
      if (!content) return;

      const focusable = Array.from(
        content.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
      ).filter((el) => el.offsetParent !== null || el === document.activeElement);
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (!active || !content.contains(active)) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  return (
    <Dialog
      ref={contentRef}
      open={open}
      onClose={onCancel}
      title={title}
      description={description}
      footer={
        <div className="flex justify-end gap-3">
          <Button ref={cancelButtonRef} type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      }
    />
  );
}
