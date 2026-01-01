interface EmptyStateProps {
  icon: string
  message: string
  submessage?: string
}

export default function EmptyState({ icon, message, submessage }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-8 px-6 text-center">
      <span className="text-3xl opacity-50">{icon}</span>
      <p className="text-sm text-text-muted">{message}</p>
      {submessage && <small className="text-xs text-text-disabled mt-2 block">{submessage}</small>}
    </div>
  )
}
