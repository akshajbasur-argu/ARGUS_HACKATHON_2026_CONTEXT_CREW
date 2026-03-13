import { useCallback, useEffect, useState } from 'react'
import { apiClient } from '@/api/client'
import { PageHeader } from '@/shared/components/PageHeader'
import { DataTable, type Column } from '@/shared/components/DataTable'
import { StatusPill } from '@/shared/components/StatusPill'
import { LoadingSpinner } from '@/shared/components/LoadingSpinner'
import { Modal } from '@/shared/components/Modal'
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

interface Reviewer {
  id: string
  full_name: string
  email: string
}

/* ── Component ─────────────────────────────────────────────────────────── */

export function ReviewQueue() {
  const [rows, setRows] = useState<QueueRow[]>([])
  const [loading, setLoading] = useState(true)
  const [reviewers, setReviewers] = useState<Reviewer[]>([])

  // Assignment modal
  const [selectedApp, setSelectedApp] = useState<QueueRow | null>(null)
  const [selectedReviewers, setSelectedReviewers] = useState<string[]>([])
  const [assigning, setAssigning] = useState(false)
  const [error, setError] = useState('')

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [appsRes, reviewersRes] = await Promise.all([
        apiClient.get('/v1/screening?pending_only=false'),
        apiClient.get('/v1/admin/users?role=reviewer').catch(() => ({ data: [] })),
      ])
      // Filter to eligible applications
      const eligible = (appsRes.data as QueueRow[]).filter(
        (r) => r.officer_decision === 'eligible' || r.screening_status === 'eligible',
      )
      setRows(eligible)
      setReviewers(reviewersRes.data)
    } catch {
      /* empty */
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  function toggleReviewer(id: string) {
    setSelectedReviewers((prev) =>
      prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id],
    )
  }

  async function assignReviewers() {
    if (!selectedApp || selectedReviewers.length === 0) return
    setAssigning(true)
    setError('')
    try {
      await apiClient.post(`/v1/review/assign/${selectedApp.application_id}`, {
        reviewer_ids: selectedReviewers,
      })
      setSelectedApp(null)
      setSelectedReviewers([])
      await fetchData()
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? String((err as { response?: { data?: { detail?: string } } }).response?.data?.detail ?? 'Assignment failed')
          : 'Assignment failed'
      setError(msg)
    } finally {
      setAssigning(false)
    }
  }

  /* ── Table columns ──────────────────────────────────────────────── */
  const columns: Column<QueueRow>[] = [
    {
      key: 'reference_number',
      header: 'Reference',
      sortable: true,
      render: (row) => (
        <span className="font-mono text-xs text-clay">{row.reference_number}</span>
      ),
    },
    { key: 'programme_name', header: 'Programme', sortable: true },
    { key: 'applicant_name', header: 'Applicant', sortable: true },
    {
      key: 'submitted_at',
      header: 'Submitted',
      sortable: true,
      render: (row) => (
        <span className="font-body text-xs text-bark">{formatDate(row.submitted_at)}</span>
      ),
    },
    {
      key: 'screening_status',
      header: 'Screening',
      render: (row) =>
        row.officer_decision ? (
          <StatusPill status={row.officer_decision} />
        ) : row.screening_status ? (
          <StatusPill status={row.screening_status} />
        ) : (
          <span className="text-xs text-sand">--</span>
        ),
    },
    {
      key: 'actions',
      header: '',
      render: (row) => (
        <button
          onClick={() => {
            setSelectedApp(row)
            setSelectedReviewers([])
            setError('')
          }}
          className="rounded-md bg-clay px-3 py-1 font-heading text-xs font-semibold text-cream transition-colors hover:bg-bark"
        >
          Assign Reviewers
        </button>
      ),
    },
  ]

  return (
    <div>
      <PageHeader
        title="Review Assignment"
        breadcrumbs={[{ label: 'Review Queue' }]}
      />

      {loading ? (
        <div className="flex h-40 items-center justify-center">
          <LoadingSpinner label="Loading eligible applications..." />
        </div>
      ) : (
        <div className="rounded-lg border border-sand bg-white shadow-card">
          <DataTable
            columns={columns}
            data={rows}
            keyExtractor={(row) => row.application_id}
            emptyMessage="No eligible applications awaiting review assignment."
            pageSize={15}
          />
        </div>
      )}

      {/* Assignment modal */}
      <Modal
        open={selectedApp != null}
        onClose={() => setSelectedApp(null)}
        title={`Assign Reviewers — ${selectedApp?.reference_number ?? ''}`}
        width="md"
      >
        {selectedApp && (
          <div className="space-y-4 p-5">
            <p className="font-body text-sm text-bark">
              {selectedApp.programme_name} &middot; {selectedApp.applicant_name}
            </p>

            <div>
              <label className="font-body text-xs font-medium text-bark">
                Select Reviewers
              </label>
              <div className="mt-2 max-h-48 space-y-1 overflow-y-auto">
                {reviewers.length === 0 ? (
                  <p className="text-xs text-sand">No reviewers available</p>
                ) : (
                  reviewers.map((r) => (
                    <label
                      key={r.id}
                      className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 transition-colors hover:bg-parchment"
                    >
                      <input
                        type="checkbox"
                        checked={selectedReviewers.includes(r.id)}
                        onChange={() => toggleReviewer(r.id)}
                        className="h-4 w-4 rounded border-sand text-clay focus:ring-clay/30"
                      />
                      <span className="font-body text-sm text-bark">{r.full_name}</span>
                      <span className="font-mono text-[10px] text-sand">{r.email}</span>
                    </label>
                  ))
                )}
              </div>
            </div>

            {error && (
              <p className="rounded-md bg-rust/10 px-3 py-2 font-body text-xs text-rust">
                {error}
              </p>
            )}

            <button
              onClick={assignReviewers}
              disabled={assigning || selectedReviewers.length === 0}
              className="w-full rounded-lg bg-soil px-4 py-2.5 font-heading text-sm font-semibold text-cream transition-colors hover:bg-bark disabled:cursor-not-allowed disabled:opacity-50"
            >
              {assigning
                ? 'Assigning...'
                : `Assign ${selectedReviewers.length} Reviewer(s)`}
            </button>
          </div>
        )}
      </Modal>
    </div>
  )
}
