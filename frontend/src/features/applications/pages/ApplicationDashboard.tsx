import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiClient } from '@/api/client'
import { PageHeader } from '@/shared/components/PageHeader'
import { DataTable, type Column } from '@/shared/components/DataTable'
import { StatusPill } from '@/shared/components/StatusPill'
import { LoadingSpinner } from '@/shared/components/LoadingSpinner'
import { formatDate } from '@/shared/utils/formatDate'

/* ── Types ─────────────────────────────────────────────────────────────── */

interface AppRow {
  id: string
  reference_number: string
  programme_name: string
  programme_id: string
  status: string
  current_stage: string | null
  submitted_at: string
  updated_at: string
  [key: string]: unknown
}

interface Programme {
  id: string
  name: string
  code: string
}

/* ── Status filter options ─────────────────────────────────────────────── */

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'screening', label: 'Screening' },
  { value: 'eligible', label: 'Eligible' },
  { value: 'ineligible', label: 'Ineligible' },
  { value: 'under_review', label: 'Under Review' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'active', label: 'Active' },
]

/* ── Component ─────────────────────────────────────────────────────────── */

export function ApplicationDashboard() {
  const navigate = useNavigate()

  const [apps, setApps] = useState<AppRow[]>([])
  const [programmes, setProgrammes] = useState<Programme[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('')
  const [progFilter, setProgFilter] = useState('')

  /* ── Fetch data ──────────────────────────────────────────────────── */
  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (statusFilter) params.set('status_filter', statusFilter)
      if (progFilter) params.set('programme_id', progFilter)

      const [appsRes, progsRes] = await Promise.all([
        apiClient.get(`/v1/applications?${params.toString()}`),
        apiClient.get('/v1/programmes'),
      ])
      setApps(appsRes.data)
      setProgrammes(progsRes.data)
    } catch {
      /* empty — table shows empty state */
    } finally {
      setLoading(false)
    }
  }, [statusFilter, progFilter])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  /* ── Table columns ───────────────────────────────────────────────── */
  const columns: Column<AppRow>[] = [
    {
      key: 'reference_number',
      header: 'Reference',
      sortable: true,
      render: (row) => (
        <button
          onClick={() => navigate(`/applications/${row.id}`)}
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
      key: 'status',
      header: 'Status',
      sortable: true,
      render: (row) => <StatusPill status={row.status} />,
    },
    {
      key: 'current_stage',
      header: 'Current Stage',
      sortable: true,
      render: (row) => (
        <span className="inline-flex items-center rounded-md bg-clay/10 px-2 py-0.5 font-mono text-xs font-medium text-clay">
          {row.current_stage ? row.current_stage.replace(/_/g, ' ') : '—'}
        </span>
      ),
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
      key: 'updated_at',
      header: 'Last Updated',
      sortable: true,
      render: (row) => (
        <span className="font-body text-xs text-sand">
          {formatDate(row.updated_at)}
        </span>
      ),
    },
  ]

  /* ── Render ──────────────────────────────────────────────────────── */
  return (
    <div>
      <PageHeader
        title="My Dashboard"
        breadcrumbs={[{ label: 'Dashboard' }]}
      />

      {/* Quick action: Eligible programmes */}
      {programmes.length > 0 && (
        <div className="mb-6">
          <h3 className="mb-3 font-heading text-sm font-semibold text-bark">
            Start a New Application
          </h3>
          <div className="flex flex-wrap gap-2">
            {programmes.map((p) => (
              <button
                key={p.id}
                onClick={() => navigate(`/apply/${p.id}`)}
                className="rounded-lg border border-sand bg-cream px-4 py-2 font-body text-sm text-soil transition-colors hover:border-clay hover:bg-parchment"
              >
                {p.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Filter bar */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <select
          value={progFilter}
          onChange={(e) => setProgFilter(e.target.value)}
          className="rounded-md border border-sand bg-cream px-3 py-2 font-body text-sm text-soil focus:border-clay focus:outline-none focus:ring-[3px] focus:ring-clay/30"
        >
          <option value="">All Programmes</option>
          {programmes.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-md border border-sand bg-cream px-3 py-2 font-body text-sm text-soil focus:border-clay focus:outline-none focus:ring-[3px] focus:ring-clay/30"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {/* Applications table */}
      {loading ? (
        <div className="flex h-40 items-center justify-center">
          <LoadingSpinner label="Loading applications..." />
        </div>
      ) : (
        <div className="rounded-lg border border-sand bg-white shadow-card">
          <DataTable
            columns={columns}
            data={apps}
            keyExtractor={(row) => row.id}
            emptyMessage="No applications yet. Start one above!"
            pageSize={10}
          />
        </div>
      )}
    </div>
  )
}
