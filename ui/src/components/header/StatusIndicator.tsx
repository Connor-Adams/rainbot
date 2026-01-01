interface StatusIndicatorProps {
  isOnline: boolean
  statusText: string
}

export default function StatusIndicator({ isOnline, statusText }: StatusIndicatorProps) {
  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-surface-elevated rounded-full border border-border hover:border-border-hover transition-colors">
      <span
        className={`
          w-2 h-2 rounded-full
          ${isOnline ? 'bg-success animate-pulse-dot shadow-glow-success' : 'bg-danger'}
        `}
      />
      <span className="text-sm text-text-secondary font-medium">{statusText}</span>
    </div>
  )
}
