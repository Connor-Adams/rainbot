import { EmptyState as DSEmptyState } from '@connor-adams/designsystem';

interface EmptyStateProps {
  icon: string;
  message: string;
  submessage?: string;
}

/**
 * Thin wrapper around the design system's EmptyState that keeps rainbot's
 * existing icon/message/submessage API so call sites don't need to change.
 */
export default function EmptyState({ icon, message, submessage }: EmptyStateProps) {
  return (
    <DSEmptyState
      className="text-center"
      title={
        <>
          <span className="block text-3xl mb-2 opacity-70" aria-hidden="true">
            {icon}
          </span>
          {message}
        </>
      }
      description={submessage}
    />
  );
}
