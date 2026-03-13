import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiClient } from '@/api/client'
import { PageHeader } from '@/shared/components/PageHeader'
import { DataTable, type Column } from '@/shared/components/DataTable'
import { StatusPill } from '@/shared/components/StatusPill'
import { LoadingSpinner } from '@/shared/components/LoadingSpinner'
import { formatDate } from '@/shared/utils/formatDate'

/* ── Types ─────────────────────────────────────────────────────────────── */

interface QueueRow {
  application_id: string
  reference_number: string
  programme_name: string
  applicant_name: string
  submitted_at: string
  screening_status: string | null
  officer_decision: string | null
  has_report: boolean
  [key: string]: unknown
}

/* ── Component ─────────────────────────────────────────────────────────── */

export function ApplicationQueue() {
  const navigate = useNavigate()
  const [rows, setRows] = useState<QueueRow[]>([])
  const [loading, setLoading] = useState(true)
  const [pendingOnly, setPendingOnly] = useState(true)

  const fetchQueue = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (pendingOnly) params.set('pending_only', 'true')
      const res = await apiClient.get(`/v1/screening?${params.toString()}`)
      setRows(res.data)
    } catch {
      /* empty */
    } finally {
      setLoading(false)
    }
  }, [pendingOnly])

  useEffect(() => {
    fetchQueue()
  }, [fetchQueue])

  /* ── Screening status pill ──────────────────────────────────────── */
  function ScreeningStatusCell({ row }: { row: QueueRow }) {
    if (!row.has_report) {
      return (
        <span className="font-mono text-xs text-sand">Pending</span>
      )
    }
    if (row.officer_decision) {
      return <StatusPill status={row.officer_decision} />
    }
    if (row.screening_status) {
      return <StatusPill status={row.screening_status} />
    }
    return <span className="font-mono text-xs text-sand">--</span>
  }

  /* ── Table columns ──────────────────────────────────────────────── */
  const columns: Column<QueueRow>[] = [
    {
      key: 'reference_number',
      header: 'Reference',
      sortable: true,
      render: (row) => (
        <button
          onClick={() => navigate(`/staff/screening/${row.application_id}`)}
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
      key: 'submitted_at',
      header: 'Submitted',
      sortable: true,
      render: (row) => (
        <span className="font-body text-xs text-bark">
          {formatDate(row.submitted_at)}
        </span>
      ),
    },
    {
      key: 'screening_status',
      header: 'Screening',
      sortable: false,
      render: (row) => <ScreeningStatusCell row={row} />,
    },
  ]

  /* ── Render ──────────────────────────────────────────────────────── */
  return (
    <div>
      <PageHeader
        title="Screening Queue"
        breadcrumbs={[{ label: 'Screening Queue' }]}
      />

      {/* Filter toggle */}
      <div className="mb-4 flex items-center gap-3">
        <label className="inline-flex cursor-pointer items-center gap-2 font-body text-sm text-bark">
          <input
            type="checkbox"
            checked={pendingOnly}
            onChange={(e) => setPendingOnly(e.target.checked)}
            className="h-4 w-4 rounded border-sand text-clay focus:ring-clay/30"
          />
          Pending decisions only
        </label>
      </div>

      {/* Queue table */}
      {loading ? (
        <div className="flex h-40 items-center justify-center">
          <LoadingSpinner label="Loading screening queue..." />
        </div>
      ) : (
        <div className="rounded-lg border border-sand bg-white shadow-card">
          <DataTable
            columns={columns}
            data={rows}
            keyExtractor={(row) => row.application_id}
            emptyMessage="No applications pending screening."
            pageSize={15}
          />
        </div>
      )}
    </div>
  )
}
