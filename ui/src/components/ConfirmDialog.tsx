import { useEffect, useRef } from 'react';
import { Button, Dialog, Spinner } from '@connor-adams/designsystem';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: React.ReactNode;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  pending?: boolean;
}

/**
 * Thin wrapper over the DS `Dialog` for confirming an irreversible action.
 *
 * `Dialog` already closes on Escape and scrim click (it calls `onClose`) and
 * owns all of that layout/scrim behaviour — this wrapper does not reimplement
 * it, it just points `onClose` at `onCancel` so both gestures always cancel,
 * never confirm. What `Dialog` does *not* do is manage focus: it neither
 * moves focus into itself on open nor restores it on close, so this wrapper
 * does both explicitly.
 */
export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  onConfirm,
  onCancel,
  pending = false,
}: ConfirmDialogProps) {
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    // Remember whatever had focus (the control that opened this dialog) and
    // move focus to Cancel — the safe default — once the dialog has mounted.
    triggerRef.current = document.activeElement as HTMLElement | null;
    const frame = window.requestAnimationFrame(() => cancelButtonRef.current?.focus());

    return () => {
      window.cancelAnimationFrame(frame);
      triggerRef.current?.focus();
      triggerRef.current = null;
    };
  }, [open]);

  return (
    <Dialog
      open={open}
      // While a mutation is in flight, Escape/scrim must not close the
      // dialog out from under it — that would be inconsistent with the
      // buttons themselves being disabled below.
      onClose={pending ? undefined : onCancel}
      title={title}
      description={description}
      footer={
        <div className="flex justify-end gap-3">
          <Button
            ref={cancelButtonRef}
            type="button"
            variant="secondary"
            onClick={onCancel}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button type="button" variant="destructive" onClick={onConfirm} disabled={pending}>
            {pending ? <Spinner size="sm" tone="current" label={confirmLabel} /> : confirmLabel}
          </Button>
        </div>
      }
    />
  );
}
