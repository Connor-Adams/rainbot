import type { ReactNode } from 'react';

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
    <div className={`stats-section surface-panel p-4 sm:p-6 mb-6 ${className}`}>
      <h3 className="text-section-title text-base sm:text-lg mb-4">{title}</h3>
      <div style={{ maxHeight }}>{children}</div>
    </div>
  );
}
