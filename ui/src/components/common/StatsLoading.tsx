interface StatsLoadingProps {
  message?: string
}

export default function StatsLoading({ message = 'Loading statistics...' }: StatsLoadingProps) {
  return <div className="stats-loading text-center py-12 text-gray-400">{message}</div>
}
