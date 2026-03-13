import { useState, useMemo, type ReactNode } from 'react'
import { cn } from '@/shared/utils/cn'

// ── Types ───────────────────────────────────────────────────────────────────

export interface Column<T> {
  key: string
  header: string
  sortable?: boolean
  render?: (row: T) => ReactNode
  className?: string
}

interface DataTableProps<T> {
  columns: Column<T>[]
  data: T[]
  keyExtractor: (row: T) => string
  pageSize?: number
  emptyMessage?: string
  className?: string
}

type SortDir = 'asc' | 'desc'

// ── Component ───────────────────────────────────────────────────────────────

export function DataTable<T extends Record<string, unknown>>({
  columns,
  data,
  keyExtractor,
  pageSize = 10,
  emptyMessage = 'No records found.',
  className,
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [page, setPage] = useState(0)

  const sorted = useMemo(() => {
    if (!sortKey) return data
    return [...data].sort((a, b) => {
      const aVal = a[sortKey]
      const bVal = b[sortKey]
      if (aVal == null && bVal == null) return 0
      if (aVal == null) return 1
      if (bVal == null) return -1
      if (aVal < bVal) return sortDir === 'asc' ? -1 : 1
      if (aVal > bVal) return sortDir === 'asc' ? 1 : -1
      return 0
    })
  }, [data, sortKey, sortDir])

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize))
  const paged = sorted.slice(page * pageSize, (page + 1) * pageSize)

  function handleSort(key: string) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
    setPage(0)
  }

  return (
    <div className={cn('w-full overflow-x-auto', className)}>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b-2 border-sand bg-parchment">
            {columns.map((col) => (
              <th
                key={col.key}
                className={cn(
                  'px-4 py-3 text-left font-heading text-xs font-semibold uppercase tracking-wider text-bark',
                  col.sortable && 'cursor-pointer select-none hover:text-clay',
                  col.className,
                )}
                onClick={col.sortable ? () => handleSort(col.key) : undefined}
              >
                <span className="inline-flex items-center gap-1">
                  {col.header}
                  {col.sortable && sortKey === col.key && (
                    <SortIcon dir={sortDir} />
                  )}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="font-body">
          {paged.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="px-4 py-12 text-center text-sand"
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            paged.map((row) => (
              <tr
                key={keyExtractor(row)}
                className="border-b border-straw/50 transition-colors hover:bg-parchment/50"
              >
                {columns.map((col) => (
                  <td key={col.key} className={cn('px-4 py-3 text-soil', col.className)}>
                    {col.render
                      ? col.render(row)
                      : String(row[col.key] ?? '—')}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-straw px-4 py-3">
          <span className="font-mono text-xs text-bark">
            Page {page + 1} of {totalPages} ({sorted.length} records)
          </span>
          <div className="flex gap-1">
            <PaginationBtn
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </PaginationBtn>
            <PaginationBtn
              disabled={page >= totalPages - 1}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </PaginationBtn>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Internal helpers ────────────────────────────────────────────────────────

function SortIcon({ dir }: { dir: SortDir }) {
  return (
    <svg
      className="h-3 w-3 text-clay"
      viewBox="0 0 12 12"
      fill="currentColor"
    >
      {dir === 'asc' ? (
        <path d="M6 2L10 8H2L6 2Z" />
      ) : (
        <path d="M6 10L2 4H10L6 10Z" />
      )}
    </svg>
  )
}

function PaginationBtn({
  children,
  disabled,
  onClick,
}: {
  children: ReactNode
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'rounded-md border px-3 py-1.5 font-mono text-xs font-medium transition-colors',
        disabled
          ? 'cursor-not-allowed border-straw bg-cream text-sand'
          : 'border-sand bg-parchment text-bark hover:border-clay hover:bg-straw',
      )}
    >
      {children}
    </button>
  )
}
