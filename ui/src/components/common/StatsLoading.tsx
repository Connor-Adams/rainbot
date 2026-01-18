interface StatsLoadingProps {
  message?: string
}

export default function StatsLoading({ message = 'Loading statistics...' }: StatsLoadingProps) {
  return <div className="stats-loading text-center py-12 text-text-secondary">{message}</div>
}
