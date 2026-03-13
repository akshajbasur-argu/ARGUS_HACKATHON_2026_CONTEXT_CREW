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
  status: string
  submitted_at: string
  updated_at: string
  [key: string]: unknown
}

interface Programme {
  id: string
  name: string
}

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'screening', label: 'Screening' },
  { value: 'eligible', label: 'Eligible' },
  { value: 'ineligible', label: 'Ineligible' },
  { value: 'under_review', label: 'Reviewing' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'active', label: 'Active' },
]

export function ApplicationList() {
  const navigate = useNavigate()

  const [apps, setApps] = useState<AppRow[]>([])
  const [programmes, setProgrammes] = useState<Programme[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('')
  const [progFilter, setProgFilter] = useState('')

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
      // Empty state handled by table
    } finally {
      setLoading(false)
    }
  }, [statusFilter, progFilter])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const columns: Column<AppRow>[] = [
    {
      key: 'reference_number',
      header: 'Reference #',
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
      render: (row) => <StatusPill status={row.status} />,
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

  return (
    <div>
      <PageHeader
        title="My Applications"
        breadcrumbs={[{ label: 'Applications' }]}
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <select
          value={progFilter}
          onChange={(e) => setProgFilter(e.target.value)}
          className="rounded-md border border-sand bg-cream px-3 py-1.5 font-body text-sm text-soil focus:outline-none focus:ring-2 focus:ring-clay/50"
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
          className="rounded-md border border-sand bg-cream px-3 py-1.5 font-body text-sm text-soil focus:outline-none focus:ring-2 focus:ring-clay/50"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="py-20 flex justify-center">
          <LoadingSpinner label="Loading applications..." />
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-sand bg-white shadow-sm">
          <DataTable
            columns={columns}
            data={apps}
            keyExtractor={(row) => row.id}
            emptyMessage="No applications found. Choose a programme to get started."
          />
        </div>
      )}
    </div>
  )
}
