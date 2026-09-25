import type { ReactNode } from 'react';
import { EmptyState as DSEmptyState } from '@connor-adams/designsystem';

/**
 * Empty state, backed by the design system's `EmptyState`.
 *
 * Keeps rainbot's `icon` / `message` / `submessage` API so call sites don't
 * change. The icon is an emoji string in every current call site, so it is
 * rendered inside the title as a decorative block above the message and hidden
 * from assistive tech; `DSEmptyState` has no icon slot of its own.
 */
interface EmptyStateProps {
  icon: string;
  message: string;
  submessage?: string;
  /** Trailing actions — a retry button, a link to docs. */
  actions?: ReactNode;
  className?: string;
}

export default function EmptyState({
  icon,
  message,
  submessage,
  actions,
  className = '',
}: EmptyStateProps) {
  return (
    <DSEmptyState
      className={`text-center ${className}`.trim()}
      title={
        <>
          <span className="block text-3xl mb-2 opacity-70" aria-hidden="true">
            {icon}
          </span>
          {message}
        </>
      }
      description={submessage}
      actions={actions}
    />
  );
}
