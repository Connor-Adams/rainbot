import type { ReactNode } from 'react';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@connor-adams/designsystem';
import EmptyState from './EmptyState';

interface Column<T = Record<string, unknown>> {
  header: string;
  key?: string;
  render?: (row: T) => ReactNode;
  className?: string;
  id?: string; // Unique identifier for the column
}

interface StatsTableProps<T = Record<string, unknown>> {
  columns: Column<T>[];
  data: T[];
  emptyMessage?: string;
  className?: string;
  getRowKey?: (row: T, index: number) => string | number; // Function to extract unique key from row
}

export default function StatsTable<T = Record<string, unknown>>({
  columns,
  data,
  emptyMessage = 'No data available',
  className = '',
  getRowKey,
}: StatsTableProps<T>) {
  if (data.length === 0) {
    return <EmptyState icon="📭" message={emptyMessage} />;
  }

  return (
    <Table className={className}>
      <TableHeader>
        <TableRow>
          {columns.map((col, idx) => (
            <TableHead key={col.id || col.header || idx} className={col.className}>
              {col.header}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((row, rowIdx) => (
          <TableRow key={getRowKey ? getRowKey(row, rowIdx) : rowIdx}>
            {columns.map((col, colIdx) => (
              <TableCell key={col.id || col.header || colIdx} className={col.className}>
                {col.render
                  ? col.render(row)
                  : col.key
                    ? String((row as Record<string, unknown>)[col.key] ?? '')
                    : null}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
