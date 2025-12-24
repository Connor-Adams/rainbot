import type { ReactNode } from 'react'

interface Column<T = Record<string, unknown>> {
  header: string
  key?: string
  render?: (row: T) => ReactNode
  className?: string
}

interface StatsTableProps<T = Record<string, unknown>> {
  columns: Column<T>[]
  data: T[]
  emptyMessage?: string
  className?: string
}

export default function StatsTable<T = Record<string, unknown>>({
  columns,
  data,
  emptyMessage = 'No data available',
  className = '',
}: StatsTableProps<T>) {
  if (data.length === 0) {
    return (
      <p className="empty-state text-gray-500 text-sm text-center py-8 px-6 flex flex-col items-center gap-2">
        <span className="text-2xl opacity-50">📭</span>
        {emptyMessage}
      </p>
    )
  }

  return (
    <div className={`overflow-x-auto ${className}`}>
      <table className="stats-table w-full">
        <thead>
          <tr>
            {columns.map((col, idx) => (
              <th key={idx} className={col.className}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, rowIdx) => (
            <tr key={rowIdx} className="hover:bg-gray-700/50 transition-colors">
              {columns.map((col, colIdx) => (
                <td key={colIdx} className={col.className || 'px-4 py-3 text-sm text-gray-400'}>
                  {col.render
                    ? col.render(row)
                    : col.key
                      ? String((row as Record<string, unknown>)[col.key] ?? '')
                      : null}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
