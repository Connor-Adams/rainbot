import { createContext, useContext } from 'react';

export type ToastType = 'success' | 'error' | 'warning';

export interface ToastData {
  id: number;
  message: string;
  type: ToastType;
}

export interface ToastContextValue {
  showToast: (message: string, type?: ToastType) => void;
}

/**
 * Shared toast state, provided once by `ToastProvider`. Consumers reach it only
 * through `useToast()`.
 */
export const ToastContext = createContext<ToastContextValue | null>(null);

/**
 * Fire a toast from anywhere under `ToastProvider`.
 *
 * Throws when no provider is above it. That is deliberate: this used to be a
 * plain hook holding its own `useState`, so every caller got a private,
 * unrendered toast list — RecordingsTab lost every toast it fired without a
 * single error. Failing loudly is what keeps that from recurring.
 */
export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}
