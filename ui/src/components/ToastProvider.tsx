import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import Toast from '@/components/Toast';
import {
  ToastContext,
  type ToastContextValue,
  type ToastData,
  type ToastType,
} from '@/hooks/useToast';

/**
 * Single source of toast state for the whole app. Mount this once, above every
 * consumer; `useToast()` then reaches this one host from anywhere.
 *
 * This replaced a plain hook that held its own `useState` per caller, so each
 * caller got a private, unrendered toast list and every toast was dropped.
 *
 * The design system ships `Toast` as presentational only, so the host below is
 * hand-rolled. When the design system gains a `Toaster` / `toast()` host,
 * swapping to it means reimplementing this file only — the `useToast()` surface
 * that consumers depend on stays as it is.
 *
 * Per-toast timing and the enter/exit animation live in `@/components/Toast`.
 */
export default function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastData[]>([]);
  const nextId = useRef(0);

  // Must stay referentially stable: consumers put `showToast` in useCallback /
  // useEffect dependency lists, so a fresh identity each render would re-fire
  // their effects (RecordingsTab would refetch in a loop).
  const showToast = useCallback((message: string, type: ToastType = 'success') => {
    const id = nextId.current++;
    setToasts((prev) => [...prev, { id, message, type }]);
  }, []);

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const value = useMemo<ToastContextValue>(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-container fixed bottom-6 right-6 flex flex-col gap-3 z-1000">
        {toasts.map((toast) => (
          <Toast
            key={toast.id}
            message={toast.message}
            type={toast.type}
            onClose={() => removeToast(toast.id)}
          />
        ))}
      </div>
    </ToastContext.Provider>
  );
}
