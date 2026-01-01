import type { ReactNode } from 'react'

interface ChartContainerProps {
  title: string
  children: ReactNode
  maxHeight?: string
  className?: string
}

export default function ChartContainer({
  title,
  children,
  maxHeight = '400px',
  className = '',
}: ChartContainerProps) {
  return (
    <div className={`stats-section bg-surface border border-border rounded-xl p-6 mb-6 ${className}`}>
      <h3 className="text-xl text-white mb-4">{title}</h3>
      <div style={{ maxHeight }}>{children}</div>
    </div>
  )
}
