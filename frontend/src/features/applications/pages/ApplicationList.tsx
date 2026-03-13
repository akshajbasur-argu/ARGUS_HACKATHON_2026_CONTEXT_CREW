import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageHeader } from '@/shared/components/PageHeader'
import { SectionCard } from '@/shared/components/SectionCard'
import { DataTable, type Column } from '@/shared/components/DataTable'
import { StatusPill } from '@/shared/components/StatusPill'
import { LoadingSpinner } from '@/shared/components/LoadingSpinner'
import { formatDate } from '@/shared/utils/formatDate'
import { apiClient } from '@/api/client'

// ── Types ────────────────────────────────────────────────────────────────────

interface AppRow {
  id: string
  reference_number: string
  programme_name: string
  status: string
  submitted_at: string | null
  updated_at: string
  [key: string]: unknown
}

// ── Column definitions ───────────────────────────────────────────────────────

const columns: Column<AppRow>[] = [
  {
    key: 'reference_number',
    header: 'Reference No.',
    sortable: true,
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
    key: 'submitted_at',
    header: 'Submitted',
    sortable: true,
    render: (row) => (row.submitted_at ? formatDate(row.submitted_at) : '—'),
  },
  {
    key: 'updated_at',
    header: 'Last Updated',
    sortable: true,
    render: (row) => formatDate(row.updated_at),
  },
]

// ── Component ────────────────────────────────────────────────────────────────

export function ApplicationList() {
  const navigate = useNavigate()
  const [applications, setApplications] = useState<AppRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchApplications = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data } = await apiClient.get<AppRow[]>('/v1/applications')
      setApplications(data)
    } catch (err) {
      setError('Failed to load applications. Please try again.')
      console.error('Error fetching applications:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchApplications()
  }, [fetchApplications])

  // ── Row click handler ────────────────────────────────────────────────────

  const handleRowClick = useCallback(
    (row: AppRow) => {
      navigate(`/applications/${row.id}`)
    },
    [navigate],
  )

  // ── Click-aware columns (wrap each cell in a clickable div) ──────────────

  const clickableColumns: Column<AppRow>[] = columns.map((col) => ({
    ...col,
    render: (row: AppRow) => (
      <div
        className="cursor-pointer"
        onClick={() => handleRowClick(row)}
        role="link"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            handleRowClick(row)
          }
        }}
      >
        {col.render ? col.render(row) : String(row[col.key] ?? '—')}
      </div>
    ),
  }))

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-6 lg:px-8">
      <PageHeader
        title="My Applications"
        breadcrumbs={[{ label: 'Applications' }]}
      />

      {/* Loading state */}
      {loading && (
        <div className="flex items-center justify-center py-24">
          <LoadingSpinner size="lg" label="Loading applications…" />
        </div>
      )}

      {/* Error state */}
      {!loading && error && (
        <SectionCard className="text-center">
          <div className="py-8">
            <p className="mb-4 font-body text-rust">{error}</p>
            <button
              type="button"
              onClick={fetchApplications}
              className="rounded-md border border-clay bg-parchment px-4 py-2 font-mono text-sm font-medium text-bark transition-colors hover:bg-sand/30"
            >
              Retry
            </button>
          </div>
        </SectionCard>
      )}

      {/* Empty state */}
      {!loading && !error && applications.length === 0 && (
        <SectionCard className="text-center">
          <div className="py-12">
            <svg
              className="mx-auto mb-4 h-16 w-16 text-sand"
              viewBox="0 0 64 64"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <rect x="12" y="8" width="40" height="48" rx="4" />
              <line x1="20" y1="20" x2="44" y2="20" />
              <line x1="20" y1="28" x2="44" y2="28" />
              <line x1="20" y1="36" x2="36" y2="36" />
            </svg>
            <h2 className="mb-2 font-heading text-lg font-semibold text-soil">
              No applications yet
            </h2>
            <p className="mb-6 font-body text-sm text-bark">
              Browse available programmes and start your first application.
            </p>
            <button
              type="button"
              onClick={() => navigate('/programmes')}
              className="inline-flex items-center gap-2 rounded-md bg-moss px-5 py-2.5 font-mono text-sm font-medium text-cream shadow-sm transition-colors hover:bg-moss/90 focus:outline-none focus:ring-2 focus:ring-moss focus:ring-offset-2 focus:ring-offset-cream"
            >
              <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 2a.75.75 0 01.75.75v4.5h4.5a.75.75 0 010 1.5h-4.5v4.5a.75.75 0 01-1.5 0v-4.5h-4.5a.75.75 0 010-1.5h4.5v-4.5A.75.75 0 018 2z" />
              </svg>
              Start Application
            </button>
          </div>
        </SectionCard>
      )}

      {/* Applications table */}
      {!loading && !error && applications.length > 0 && (
        <SectionCard noPadding>
          <DataTable<AppRow>
            columns={clickableColumns}
            data={applications}
            keyExtractor={(row) => row.id}
            pageSize={10}
            emptyMessage="No applications found."
          />
        </SectionCard>
      )}
    </div>
  )
}
