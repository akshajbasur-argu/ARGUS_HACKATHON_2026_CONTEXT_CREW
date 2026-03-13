import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiClient } from '@/api/client'
import { PageHeader } from '@/shared/components/PageHeader'
import { DataTable, type Column } from '@/shared/components/DataTable'
import { LoadingSpinner } from '@/shared/components/LoadingSpinner'
import { formatDate } from '@/shared/utils/formatDate'

/* ── Types ─────────────────────────────────────────────────────────────── */

interface QueueRow {
  assignment_id: string
  application_id: string
  reference_number: string
  programme_name: string
  applicant_name: string
  assigned_at: string
  completed_at: string | null
  has_package: boolean
  [key: string]: unknown
}

/* ── Component ─────────────────────────────────────────────────────────── */

export function ReviewerQueue() {
  const navigate = useNavigate()
  const [rows, setRows] = useState<QueueRow[]>([])
  const [loading, setLoading] = useState(true)

  const fetchQueue = useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiClient.get('/v1/review/queue')
      setRows(res.data)
    } catch {
      /* empty */
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchQueue()
  }, [fetchQueue])

  /* ── Table columns ──────────────────────────────────────────────── */
  const columns: Column<QueueRow>[] = [
    {
      key: 'reference_number',
      header: 'Reference',
      sortable: true,
      render: (row) => (
        <button
          onClick={() => navigate(`/reviewer/review/${row.application_id}`)}
          className="font-mono text-xs text-clay hover:underline"
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
      key: 'applicant_name',
      header: 'Applicant',
      sortable: true,
    },
    {
      key: 'assigned_at',
      header: 'Assigned',
      sortable: true,
      render: (row) => (
        <span className="font-body text-xs text-bark">
          {formatDate(row.assigned_at)}
        </span>
      ),
    },
    {
      key: 'completed_at',
      header: 'Status',
      sortable: false,
      render: (row) =>
        row.completed_at ? (
          <span className="inline-flex items-center gap-1 rounded-pill bg-moss/15 px-2 py-0.5 font-mono text-xs font-semibold text-moss">
            <svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
            Completed
          </span>
        ) : row.has_package ? (
          <span className="inline-flex items-center rounded-pill bg-amber/15 px-2 py-0.5 font-mono text-xs font-semibold text-amber">
            Ready to Review
          </span>
        ) : (
          <span className="inline-flex items-center rounded-pill bg-sand/20 px-2 py-0.5 font-mono text-xs text-sand">
            Package Generating...
          </span>
        ),
    },
  ]

  /* ── Render ──────────────────────────────────────────────────────── */
  return (
    <div>
      <PageHeader
        title="My Review Queue"
        breadcrumbs={[{ label: 'Review Queue' }]}
      />

      {loading ? (
        <div className="flex h-40 items-center justify-center">
          <LoadingSpinner label="Loading assignments..." />
        </div>
      ) : (
        <div className="rounded-lg border border-sand bg-white shadow-card">
          <DataTable
            columns={columns}
            data={rows}
            keyExtractor={(row) => row.assignment_id}
            emptyMessage="No applications assigned for review."
            pageSize={15}
          />
        </div>
      )}
    </div>
  )
}
