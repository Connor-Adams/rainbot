import type { ReactNode } from 'react';
import { DataTable } from '@connor-adams/designsystem';
import type { DataTableColumn, DataTableSort } from '@connor-adams/designsystem';
import EmptyState from './EmptyState';

/**
 * Column-config table, backed by the design system's `DataTable`.
 *
 * This wrapper's column API was the reference `DataTable` was designed from, so
 * the mapping is close to one-to-one: `header`, `render` and `className` pass
 * straight through. Two differences are bridged here rather than pushed onto
 * the ~5 stats components that call it:
 *
 *  - `DataTable` requires a `key` per column; this wrapper's is optional. The
 *    key is taken from `id ?? key ?? <index>`.
 *  - `DataTable` requires `getRowKey`; this wrapper's is optional and falls
 *    back to the array index, as it did before.
 *
 * `align` / `width` / `sortable` are new optional per-column passthroughs, and
 * `sort` / `onSortChange` / `loading` / `maxHeight` are new optional table-level
 * ones — all additive, so no call site changes. `DataTable`'s sorting is
 * controlled and presentational: it renders the button and `aria-sort` and
 * reports the next state; the caller still owns the ordering.
 */
interface Column<T = Record<string, unknown>> {
  header: string;
  key?: string;
  render?: (row: T) => ReactNode;
  className?: string;
  /** Unique identifier for the column. Also what `onSortChange` reports. */
  id?: string;
  align?: 'left' | 'center' | 'right';
  width?: number | string;
  sortable?: boolean;
}

interface StatsTableProps<T = Record<string, unknown>> {
  columns: Column<T>[];
  data: T[];
  emptyMessage?: string;
  className?: string;
  /** Extract a stable key from a row. Falls back to the array index. */
  getRowKey?: (row: T, index: number) => string | number;
  /** Controlled sort state, or null for unsorted. */
  sort?: DataTableSort | null;
  onSortChange?: (sort: DataTableSort | null) => void;
  /** Replace the body with shimmering skeleton rows. */
  loading?: boolean;
  loadingRows?: number;
  /** Max height of the scroll region; the head stays sticky above it. */
  maxHeight?: string;
  containerClassName?: string;
}

export default function StatsTable<T = Record<string, unknown>>({
  columns,
  data,
  emptyMessage = 'No data available',
  className = '',
  getRowKey,
  sort,
  onSortChange,
  loading,
  loadingRows,
  maxHeight,
  containerClassName,
}: StatsTableProps<T>) {
  // Preserved behaviour: an empty table is replaced wholesale by the empty
  // state, headers and all. `DataTable` can instead keep the head and show an
  // `empty` cell beneath it; that is a visual change to every caller, so it is
  // left for whoever converts them.
  if (!loading && data.length === 0) {
    return <EmptyState icon="📭" message={emptyMessage} />;
  }

  // Every column is given an explicit `render`, which both preserves the old
  // `String(row[key] ?? '')` cell fallback (and the `null` for a column with
  // neither `render` nor `key`) and satisfies `DataTableColumn`'s rule that a
  // key not naming a field of `T` is only legal alongside a renderer.
  const dsColumns: DataTableColumn<T>[] = columns.map((col, idx) => ({
    key: col.id ?? col.key ?? String(idx),
    header: col.header,
    className: col.className,
    align: col.align,
    width: col.width,
    sortable: col.sortable,
    render: (row: T) => {
      if (col.render) return col.render(row);
      if (col.key) return String((row as Record<string, unknown>)[col.key] ?? '');
      return null;
    },
  }));

  return (
    <DataTable<T>
      className={className}
      columns={dsColumns}
      rows={data}
      getRowKey={(row, index) => (getRowKey ? getRowKey(row, index) : index)}
      sort={sort}
      onSortChange={onSortChange}
      loading={loading}
      loadingRows={loadingRows}
      maxHeight={maxHeight}
      containerClassName={containerClassName}
    />
  );
}
