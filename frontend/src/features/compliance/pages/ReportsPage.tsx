import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageHeader } from '@/shared/components/PageHeader'
import { SectionCard } from '@/shared/components/SectionCard'
import { DataTable, type Column } from '@/shared/components/DataTable'
import { StatusPill } from '@/shared/components/StatusPill'
import { LoadingSpinner } from '@/shared/components/LoadingSpinner'
import { formatDateTime } from '@/shared/utils/formatDate'
import { apiClient } from '@/api/client'

interface ReportRow {
  id: string
  application_id: string
  report_type: string
  period_label: string
  submitted_at: string
  reviewed_at: string | null
  status: string
  [key: string]: unknown
}

export function ReportsPage() {
  const navigate = useNavigate()
  const [reports, setReports] = useState<ReportRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const fetchReports = useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiClient.get('/v1/compliance/staff/reports')
      setReports(res.data)
    } catch {
      setError('Failed to load reports.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchReports()
  }, [fetchReports])

  const columns: Column<ReportRow>[] = [
    {
      key: 'period_label',
      header: 'Period',
      sortable: true,
      render: (row) => <span className="font-medium text-soil">{row.period_label}</span>,
    },
    {
      key: 'report_type',
      header: 'Type',
      render: (row) => (
        <span className="font-mono text-xs uppercase text-bark">{row.report_type}</span>
      ),
    },
    {
      key: 'submitted_at',
      header: 'Submitted',
      sortable: true,
      render: (row) => (
        <span className="font-body text-sm text-bark">{formatDateTime(row.submitted_at)}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      render: (row) => <StatusPill status={row.status} />,
    },
    {
      key: 'actions',
      header: '',
      render: (row) => (
        <button
          type="button"
          onClick={() => navigate(`/staff/compliance/${row.id}`)}
          className="rounded-md bg-clay px-3 py-1.5 font-body text-xs font-medium text-cream transition-colors hover:bg-bark"
        >
          Review
        </button>
      ),
    },
  ]

  if (loading) {
    return <div className="mx-auto max-w-5xl py-12"><LoadingSpinner label="Loading reports..." /></div>
  }

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Compliance Reports" breadcrumbs={[{ label: 'Reports' }]} />

      {error && (
        <div className="mb-4 rounded-md border border-rust/30 bg-rust/10 px-4 py-3">
          <p className="font-body text-sm text-rust">{error}</p>
        </div>
      )}

      <SectionCard noPadding>
        <DataTable
          columns={columns}
          data={reports}
          keyExtractor={(row) => row.id}
          emptyMessage="No reports pending review."
          pageSize={15}
        />
      </SectionCard>
    </div>
  )
}
