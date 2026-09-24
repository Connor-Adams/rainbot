import type { ReactNode } from 'react';
import { Card, CardHeader, CardTitle } from '@connor-adams/designsystem';

interface ChartContainerProps {
  title: string;
  children: ReactNode;
  maxHeight?: string;
  className?: string;
}

export default function ChartContainer({
  title,
  children,
  maxHeight = '400px',
  className = '',
}: ChartContainerProps) {
  return (
    <Card className={`mb-6 ${className}`}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <div style={{ maxHeight }}>{children}</div>
    </Card>
  );
}
