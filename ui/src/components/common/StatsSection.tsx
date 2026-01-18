import type { ReactNode } from 'react'

interface StatsSectionProps {
  title?: string
  children: ReactNode
  className?: string
}

export default function StatsSection({ title, children, className = '' }: StatsSectionProps) {
  return (
    <div
      className={`stats-section bg-surface border border-border rounded-xl p-4 sm:p-6 ${className}`}
    >
      {title && <h3 className="text-lg sm:text-xl text-text-primary mb-4">{title}</h3>}
      {children}
    </div>
  )
}
