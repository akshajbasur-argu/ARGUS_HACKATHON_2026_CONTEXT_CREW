import { useState, useEffect, useCallback } from 'react'
import { PageHeader } from '@/shared/components/PageHeader'
import { SectionCard } from '@/shared/components/SectionCard'
import { FormInput } from '@/shared/components/FormField'
import { LoadingSpinner } from '@/shared/components/LoadingSpinner'
import { cn } from '@/shared/utils/cn'
import { formatDateTime } from '@/shared/utils/formatDate'
import { apiClient } from '@/api/client'

interface AuditEntry {
  id: number
  actor_id: string | null
  actor_email: string | null
  action: string
  object_type: string
  object_id: string | null
  metadata_json: Record<string, unknown>
  created_at: string
  [key: string]: unknown
}

export function AuditLog() {
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const pageSize = 50

  // Filters
  const [actorEmail, setActorEmail] = useState('')
  const [actionFilter, setActionFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const fetchLogs = useCallback(async (pageNum: number, append: boolean) => {
    if (append) {
      setLoadingMore(true)
    } else {
      setLoading(true)
    }

    try {
      const params: Record<string, string | number> = {
        page: pageNum,
        page_size: pageSize,
      }
      if (actorEmail.trim()) params.actor_email = actorEmail.trim()
      if (actionFilter.trim()) params.action = actionFilter.trim()
      if (dateFrom) params.date_from = new Date(dateFrom).toISOString()
      if (dateTo) params.date_to = new Date(dateTo + 'T23:59:59').toISOString()

      const res = await apiClient.get('/v1/admin/audit-log', { params })
      const data = res.data

      if (append) {
        setEntries((prev) => [...prev, ...data.items])
      } else {
        setEntries(data.items)
      }
      setTotal(data.total)
      setPage(pageNum)
    } catch {
      // silent
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [actorEmail, actionFilter, dateFrom, dateTo])

  useEffect(() => {
    fetchLogs(1, false)
  }, [fetchLogs])

  const handleLoadMore = () => {
    fetchLogs(page + 1, true)
  }

  const hasMore = entries.length < total

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Audit Log"
        breadcrumbs={[{ label: 'Admin', href: '/admin/users' }, { label: 'Audit Log' }]}
      />

      {/* Filters */}
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <FormInput
          label="Actor Email"
          value={actorEmail}
          onChange={(e) => setActorEmail(e.target.value)}
          placeholder="Filter by email..."
        />
        <FormInput
          label="Action"
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          placeholder="e.g. login, message_sent..."
        />
        <FormInput
          label="Date From"
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
        />
        <FormInput
          label="Date To"
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
        />
      </div>

      {loading && (
        <div className="py-12">
          <LoadingSpinner label="Loading audit log..." />
        </div>
      )}

      {!loading && (
        <SectionCard noPadding>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b-2 border-sand bg-parchment">
                  <th className="px-4 py-3 text-left font-heading text-xs font-semibold uppercase tracking-wider text-bark">
                    Timestamp
                  </th>
                  <th className="px-4 py-3 text-left font-heading text-xs font-semibold uppercase tracking-wider text-bark">
                    Actor
                  </th>
                  <th className="px-4 py-3 text-left font-heading text-xs font-semibold uppercase tracking-wider text-bark">
                    Action
                  </th>
                  <th className="px-4 py-3 text-left font-heading text-xs font-semibold uppercase tracking-wider text-bark">
                    Object
                  </th>
                </tr>
              </thead>
              <tbody className="font-body">
                {entries.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-12 text-center text-sand">
                      No audit log entries found.
                    </td>
                  </tr>
                )}
                {entries.map((entry) => (
                  <tr
                    key={entry.id}
                    className="border-b border-straw/50 transition-colors hover:bg-parchment/50"
                  >
                    <td className="px-4 py-3 font-mono text-xs text-bark whitespace-nowrap">
                      {formatDateTime(entry.created_at)}
                    </td>
                    <td className="px-4 py-3 text-soil">
                      {entry.actor_email || (
                        <span className="text-sand italic">system</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-sm bg-parchment px-2 py-0.5 font-mono text-xs font-medium text-clay border border-sand">
                        {entry.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-bark">
                      <span className="font-body text-sm">{entry.object_type}</span>
                      {entry.object_id && (
                        <span className="ml-1 font-mono text-xs text-sand">
                          {entry.object_id.length > 12
                            ? entry.object_id.slice(0, 12) + '...'
                            : entry.object_id}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Load more */}
          {hasMore && (
            <div className="flex items-center justify-between border-t border-straw px-4 py-3">
              <span className="font-mono text-xs text-bark">
                Showing {entries.length} of {total} entries
              </span>
              <button
                type="button"
                onClick={handleLoadMore}
                disabled={loadingMore}
                className={cn(
                  'rounded-md px-4 py-1.5 font-body text-sm font-medium transition-colors',
                  'bg-clay text-cream hover:bg-bark',
                  'disabled:cursor-not-allowed disabled:opacity-50',
                )}
              >
                {loadingMore ? 'Loading...' : 'Load More'}
              </button>
            </div>
          )}

          {!hasMore && entries.length > 0 && (
            <div className="border-t border-straw px-4 py-3">
              <span className="font-mono text-xs text-sand">
                All {total} entries loaded
              </span>
            </div>
          )}
        </SectionCard>
      )}
    </div>
  )
}
