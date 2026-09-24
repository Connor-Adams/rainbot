import { Spinner, SkeletonText, Text } from '@connor-adams/designsystem';

/**
 * Loading state for a stats panel.
 *
 * The old wrapper hung its layout off a `stats-loading` class that is defined
 * nowhere in the app or in either design-system package — dead weight. It is
 * gone; `Spinner` and `Text` carry the styling.
 *
 * `variant="skeleton"` renders shaped `SkeletonText` placeholders instead,
 * which reads better than a spinner for a panel that is about to fill with
 * rows of text (a table, a list). The default stays the spinner so existing
 * call sites are unchanged.
 */
interface StatsLoadingProps {
  message?: string;
  variant?: 'spinner' | 'skeleton';
  /** Placeholder lines in `skeleton` mode. */
  lines?: number;
}

export default function StatsLoading({
  message = 'Loading statistics...',
  variant = 'spinner',
  lines = 4,
}: StatsLoadingProps) {
  if (variant === 'skeleton') {
    return (
      <div className="py-4" role="status" aria-busy="true" aria-label={message}>
        <SkeletonText lines={lines} />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3 py-12">
      <Spinner tone="muted" label={message} />
      <Text tone="muted">{message}</Text>
    </div>
  );
}
