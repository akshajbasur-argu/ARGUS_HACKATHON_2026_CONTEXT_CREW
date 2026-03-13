import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageHeader } from '@/shared/components/PageHeader'
import { SectionCard } from '@/shared/components/SectionCard'
import { DataTable, type Column } from '@/shared/components/DataTable'
import { StatusPill } from '@/shared/components/StatusPill'
import { LoadingSpinner } from '@/shared/components/LoadingSpinner'
import { formatDate } from '@/shared/utils/formatDate'
import { apiClient } from '@/api/client'

/* ── Types ─────────────────────────────────────────────────────────────── */

interface QueueItem {
  application_id: string
  reference_number: string
  programme_name: string
  assigned_at: string
  due_at: string | null
  status: string
  overall_score: number | null
  [key: string]: unknown
}

const COMPLETED_STATUSES = new Set(['submitted', 'completed'])

/* ── Component ─────────────────────────────────────────────────────────── */

export function CompletedReviews() {
  const navigate = useNavigate()
  const [rows, setRows] = useState<QueueItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchCompleted = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await apiClient.get('/v1/review/queue')
      const all: QueueItem[] = res.data
      setRows(all.filter((item) => COMPLETED_STATUSES.has(item.status)))
    } catch {
      setError('Failed to load completed reviews. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchCompleted()
  }, [fetchCompleted])

  /* ── Table columns ──────────────────────────────────────────────── */

  const columns: Column<QueueItem>[] = [
    {
      key: 'reference_number',
      header: 'Reference Number',
      sortable: true,
      render: (row) => (
        <button
          onClick={() => navigate(`/reviewer/review/${row.application_id}`)}
          className="font-mono text-xs text-water hover:text-clay hover:underline"
        >
          {row.reference_number}
        </button>
      ),
    },
    {
      key: 'programme_name',
      header: 'Programme',
      sortable: true,
    },
    {
      key: 'assigned_at',
      header: 'Submitted Date',
      sortable: true,
      render: (row) => (
        <span className="font-body text-xs text-bark">
          {formatDate(row.assigned_at)}
        </span>
      ),
    },
    {
      key: 'overall_score',
      header: 'Overall Score',
      sortable: true,
      render: (row) =>
        row.overall_score != null ? (
          <span className="inline-flex items-center justify-center rounded-md bg-moss/10 px-2.5 py-0.5 font-mono text-xs font-semibold text-moss">
            {row.overall_score}
          </span>
        ) : (
          <span className="font-mono text-xs text-sand">--</span>
        ),
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      render: (row) => <StatusPill status={row.status} />,
    },
  ]

  /* ── Render ──────────────────────────────────────────────────────── */

  return (
    <div>
      <PageHeader
        title="Completed Reviews"
        breadcrumbs={[{ label: 'Completed Reviews' }]}
      />

      <SectionCard>
        {loading ? (
          <div className="flex h-40 items-center justify-center">
            <LoadingSpinner label="Loading completed reviews..." />
          </div>
        ) : error ? (
          <div className="flex h-40 flex-col items-center justify-center gap-3">
            <p className="font-body text-sm text-rust">{error}</p>
            <button
              type="button"
              onClick={fetchCompleted}
              className="rounded-md border border-sand bg-parchment px-4 py-1.5 font-mono text-xs font-medium text-bark transition-colors hover:border-clay hover:bg-straw"
            >
              Retry
            </button>
          </div>
        ) : (
          <DataTable
            columns={columns}
            data={rows}
            keyExtractor={(row) => row.application_id}
            emptyMessage="No completed reviews found."
            pageSize={15}
          />
        )}
      </SectionCard>
    </div>
  )
}
