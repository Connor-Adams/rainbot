import type { ReactNode } from 'react'

interface Column<T = Record<string, unknown>> {
  header: string
  key?: string
  render?: (row: T) => ReactNode
  className?: string
  id?: string // Unique identifier for the column
}

interface StatsTableProps<T = Record<string, unknown>> {
  columns: Column<T>[]
  data: T[]
  emptyMessage?: string
  className?: string
  getRowKey?: (row: T, index: number) => string | number // Function to extract unique key from row
}

export default function StatsTable<T = Record<string, unknown>>({
  columns,
  data,
  emptyMessage = 'No data available',
  className = '',
  getRowKey,
}: StatsTableProps<T>) {
  if (data.length === 0) {
    return (
      <p className="empty-state text-text-muted text-sm text-center py-8 px-6 flex flex-col items-center gap-2">
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
              <th key={col.id || col.header || idx} className={col.className}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, rowIdx) => (
            <tr
              key={getRowKey ? getRowKey(row, rowIdx) : rowIdx}
              className="hover:bg-surface-hover transition-colors"
            >
              {columns.map((col, colIdx) => (
                <td
                  key={col.id || col.header || colIdx}
                  className={col.className || 'px-4 py-3 text-sm text-text-secondary'}
                >
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
