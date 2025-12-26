import type { ReactNode } from 'react'

interface StatCardProps {
  value: string | number
  label: string
  icon?: ReactNode
  className?: string
}

export default function StatCard({ value, label, icon, className = '' }: StatCardProps) {
  return (
    <div
      className={`stat-card bg-gray-800 border border-gray-700 rounded-xl p-6 text-center transition-all hover:border-gray-600 hover:-translate-y-0.5 hover:shadow-lg ${className}`}
    >
      {icon && <div className="stat-icon mb-2">{icon}</div>}
      <div className="stat-value text-4xl font-bold text-blue-500 mb-2 font-mono">
        {typeof value === 'number' ? value.toLocaleString() : value}
      </div>
      <div className="stat-label text-xs text-gray-400 uppercase tracking-wider">{label}</div>
    </div>
  )
}
