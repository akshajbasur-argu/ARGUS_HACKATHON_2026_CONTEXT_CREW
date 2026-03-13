import { useState, useEffect, useCallback } from 'react'
import { PageHeader } from '@/shared/components/PageHeader'
import { SectionCard } from '@/shared/components/SectionCard'
import { DataTable, type Column } from '@/shared/components/DataTable'
import { StatusPill } from '@/shared/components/StatusPill'
import { LoadingSpinner } from '@/shared/components/LoadingSpinner'
import { formatINR, formatINRCompact } from '@/shared/utils/formatCurrency'
import { formatDate } from '@/shared/utils/formatDate'
import { apiClient } from '@/api/client'

// ── Types ────────────────────────────────────────────────────────────────────

interface Programme {
  id: string
  code: string
  name: string
  sector: string
  max_grant_inr: number
  status: string
  deadline: string | null
  description: string
  [key: string]: unknown
}

// ── Columns ──────────────────────────────────────────────────────────────────

const columns: Column<Programme>[] = [
  {
    key: 'code',
    header: 'Programme Code',
    sortable: true,
    render: (row) => (
      <span className="font-mono text-xs font-semibold text-soil">{row.code}</span>
    ),
  },
  {
    key: 'name',
    header: 'Name',
    sortable: true,
    render: (row) => (
      <div>
        <p className="font-medium text-soil">{row.name}</p>
        {row.description && (
          <p className="mt-0.5 text-xs text-bark/70 line-clamp-1">{row.description}</p>
        )}
      </div>
    ),
  },
  {
    key: 'sector',
    header: 'Sector',
    sortable: true,
    render: (row) => (
      <span className="inline-flex items-center rounded-md bg-sand/20 px-2 py-0.5 font-mono text-xs text-bark">
        {row.sector}
      </span>
    ),
  },
  {
    key: 'max_grant_inr',
    header: 'Max Grant (INR)',
    sortable: true,
    className: 'text-right',
    render: (row) => (
      <span className="font-mono text-sm font-medium text-soil">
        {formatINR(row.max_grant_inr)}
      </span>
    ),
  },
  {
    key: 'status',
    header: 'Status',
    sortable: true,
    render: (row) => <StatusPill status={row.status} />,
  },
  {
    key: 'deadline',
    header: 'Application Deadline',
    sortable: true,
    render: (row) =>
      row.deadline ? (
        <span className="font-mono text-xs text-bark">{formatDate(row.deadline)}</span>
      ) : (
        <span className="text-xs text-sand">—</span>
      ),
  },
]

// ── Component ────────────────────────────────────────────────────────────────

export function ProgrammeManagement() {
  const [programmes, setProgrammes] = useState<Programme[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchProgrammes = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data } = await apiClient.get<Programme[]>('/v1/programmes')
      setProgrammes(data)
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to load programmes.'
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchProgrammes()
  }, [fetchProgrammes])

  // ── Derived stats ────────────────────────────────────────────────────────

  const totalProgrammes = programmes.length
  const totalFundingPool = programmes.reduce((sum, p) => sum + (p.max_grant_inr ?? 0), 0)
  const activeProgrammes = programmes.filter((p) => p.status === 'active').length

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <PageHeader
        title="Programme Management"
        breadcrumbs={[
          { label: 'Admin', href: '/admin' },
          { label: 'Programmes' },
        ]}
      />

      {/* Summary Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Total Programmes"
          value={String(totalProgrammes)}
          icon={
            <svg className="h-5 w-5 text-water" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" />
            </svg>
          }
        />
        <StatCard
          label="Total Funding Pool"
          value={formatINRCompact(totalFundingPool)}
          subtitle={formatINR(totalFundingPool)}
          icon={
            <svg className="h-5 w-5 text-amber" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
        <StatCard
          label="Active Programmes"
          value={String(activeProgrammes)}
          icon={
            <svg className="h-5 w-5 text-moss" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
      </div>

      {/* Main Table */}
      <SectionCard title="All Programmes" noPadding>
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <LoadingSpinner size="lg" label="Loading programmes…" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-3 py-16">
            <p className="text-sm text-rust">{error}</p>
            <button
              type="button"
              onClick={fetchProgrammes}
              className="rounded-md border border-sand bg-cream px-4 py-2 font-mono text-xs font-medium text-bark transition-colors hover:border-clay hover:bg-parchment"
            >
              Retry
            </button>
          </div>
        ) : (
          <DataTable<Programme>
            columns={columns}
            data={programmes}
            keyExtractor={(row) => row.id}
            pageSize={10}
            emptyMessage="No programmes found."
          />
        )}
      </SectionCard>
    </div>
  )
}

// ── Internal: Stat Card ──────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  subtitle,
  icon,
}: {
  label: string
  value: string
  subtitle?: string
  icon?: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-4 rounded-lg border border-sand bg-cream px-5 py-4 shadow-sm">
      {icon && (
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-parchment">
          {icon}
        </div>
      )}
      <div>
        <p className="font-mono text-xs uppercase tracking-wider text-bark/70">{label}</p>
        <p className="font-heading text-xl font-bold text-soil">{value}</p>
        {subtitle && (
          <p className="font-mono text-xs text-bark/50">{subtitle}</p>
        )}
      </div>
    </div>
  )
}
