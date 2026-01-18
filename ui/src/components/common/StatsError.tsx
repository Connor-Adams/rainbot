interface StatsErrorProps {
  error: unknown
  message?: string
}

export default function StatsError({ error, message }: StatsErrorProps) {
  const errorMessage = error instanceof Error ? error.message : 'Unknown error'
  const displayMessage = message ? `${message}: ${errorMessage}` : `Error: ${errorMessage}`

  return <div className="stats-error text-center py-12 text-danger-light">{displayMessage}</div>
}
