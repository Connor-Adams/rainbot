import type { ReactNode } from 'react';
import { Card, CardHeader, CardTitle, CardDescription } from '@connor-adams/designsystem';

/**
 * Section shell for a stats panel, backed by the design system's `Card`.
 *
 * Keeps the `title` / `children` / `className` API the ~20 stats components
 * already call it with, and adds the knobs `Card` gained in 2.0.0 as optional
 * passthroughs so a panel can reach them without a new wrapper: `variant`
 * (`nested` for a panel inside another panel, `plain` to keep only the padding
 * contract), `padding`, `radius`, plus a header `actions` slot and a
 * `description` line.
 */
interface StatsSectionProps {
  title?: ReactNode;
  /** Supporting line under the title. */
  description?: ReactNode;
  /** Trailing-edge header content — a period selector, a refresh button. */
  actions?: ReactNode;
  children: ReactNode;
  /** Surface treatment. `nested` for a panel inside another panel. */
  variant?: 'default' | 'nested' | 'plain';
  padding?: 'none' | 'sm' | 'default' | 'lg';
  radius?: 'md' | 'lg' | 'xl';
  className?: string;
}

export default function StatsSection({
  title,
  description,
  actions,
  children,
  variant,
  padding,
  radius,
  className = '',
}: StatsSectionProps) {
  const hasHeader = title != null || description != null || actions != null;

  return (
    <Card className={className} variant={variant} padding={padding} radius={radius}>
      {hasHeader && (
        <CardHeader actions={actions}>
          {title != null && <CardTitle>{title}</CardTitle>}
          {description != null && <CardDescription>{description}</CardDescription>}
        </CardHeader>
      )}
      {children}
    </Card>
  );
}
