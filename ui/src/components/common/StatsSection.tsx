import type { ReactNode } from 'react';
import { Card, CardHeader, CardTitle } from '@connor-adams/designsystem';

interface StatsSectionProps {
  title?: string;
  children: ReactNode;
  className?: string;
}

/**
 * Thin wrapper around the design system's Card that keeps rainbot's existing
 * title/children API so the ~20 stats components using it don't need to change.
 */
export default function StatsSection({ title, children, className = '' }: StatsSectionProps) {
  return (
    <Card className={className}>
      {title && (
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
      )}
      {children}
    </Card>
  );
}
