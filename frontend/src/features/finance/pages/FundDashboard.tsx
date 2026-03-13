import { useState, useEffect, useCallback, useMemo } from 'react'
import { PageHeader } from '@/shared/components/PageHeader'
import { SectionCard } from '@/shared/components/SectionCard'
import { StatusPill } from '@/shared/components/StatusPill'
import { LoadingSpinner } from '@/shared/components/LoadingSpinner'
import { cn } from '@/shared/utils/cn'
import { formatINR, formatINRCompact } from '@/shared/utils/formatCurrency'
import { apiClient } from '@/api/client'

interface GrantRow {
  application_id: string
  reference_number: string
  programme_name: string
  status: string
  budget: string
  disbursed: string
  spent: string
  pct_spent: number
  [key: string]: unknown
}

interface DashboardData {
  total_committed: string
  total_disbursed: string
  total_reported_expenditure: string
  grant_count: number
  grants_by_status: Record<string, number>
  grants: GrantRow[]
}

export function FundDashboard() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Filters
  const [filterProgramme, setFilterProgramme] = useState('')
  const [filterStatus, setFilterStatus] = useState('')

  const fetchDashboard = useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiClient.get('/v1/finance/dashboard')
      setData(res.data)
    } catch {
      setError('Failed to load dashboard data.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchDashboard()
  }, [fetchDashboard])

  // Unique programmes and statuses for filters
  const programmes = useMemo(() => {
    if (!data) return []
    return [...new Set(data.grants.map((g) => g.programme_name))].sort()
  }, [data])

  const statuses = useMemo(() => {
    if (!data) return []
    return [...new Set(data.grants.map((g) => g.status))].sort()
  }, [data])

  // Filtered grants
  const filteredGrants = useMemo(() => {
    if (!data) return []
    return data.grants.filter((g) => {
      if (filterProgramme && g.programme_name !== filterProgramme) return false
      if (filterStatus && g.status !== filterStatus) return false
      return true
    })
  }, [data, filterProgramme, filterStatus])

  // CSV export
  const exportCSV = useCallback(() => {
    if (!filteredGrants.length) return
    const headers = ['Reference', 'Programme', 'Status', 'Budget (INR)', 'Disbursed (INR)', 'Spent (INR)', '% Spent']
    const rows = filteredGrants.map((g) => [
      g.reference_number,
      g.programme_name,
      g.status,
      g.budget,
      g.disbursed,
      g.spent,
      g.pct_spent.toString(),
    ])
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${c}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'fund_dashboard_export.csv'
    a.click()
    URL.revokeObjectURL(url)
  }, [filteredGrants])

  if (loading) {
    return <div className="mx-auto max-w-6xl py-12"><LoadingSpinner label="Loading dashboard..." /></div>
  }

  if (error || !data) {
    return (
      <div className="mx-auto max-w-6xl">
        <PageHeader title="Fund Dashboard" breadcrumbs={[{ label: 'Dashboard' }]} />
        <p className="font-body text-sm text-rust">{error}</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Fund Dashboard"
        breadcrumbs={[{ label: 'Finance' }, { label: 'Dashboard' }]}
        action={
          <button
            type="button"
            onClick={exportCSV}
            className={cn(
              'rounded-md border border-sand bg-cream px-4 py-2',
              'font-body text-sm font-medium text-bark',
              'transition-colors hover:bg-parchment',
            )}
          >
            Export CSV
          </button>
        }
      />

      {/* Metric cards */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Total Committed"
          value={formatINRCompact(parseFloat(data.total_committed))}
          detail={formatINR(parseFloat(data.total_committed))}
          color="bg-clay"
        />
        <MetricCard
          label="Total Disbursed"
          value={formatINRCompact(parseFloat(data.total_disbursed))}
          detail={formatINR(parseFloat(data.total_disbursed))}
          color="bg-moss"
        />
        <MetricCard
          label="Reported Expenditure"
          value={formatINRCompact(parseFloat(data.total_reported_expenditure))}
          detail={formatINR(parseFloat(data.total_reported_expenditure))}
          color="bg-water"
        />
        <MetricCard
          label="Total Grants"
          value={String(data.grant_count)}
          detail={Object.entries(data.grants_by_status).map(([s, n]) => `${s}: ${n}`).join(', ')}
          color="bg-amber"
        />
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap gap-3">
        <select
          value={filterProgramme}
          onChange={(e) => setFilterProgramme(e.target.value)}
          className="rounded-md border border-sand bg-cream px-3 py-2 font-body text-sm text-soil focus:border-clay focus:outline-none"
        >
          <option value="">All Programmes</option>
          {programmes.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="rounded-md border border-sand bg-cream px-3 py-2 font-body text-sm text-soil focus:border-clay focus:outline-none"
        >
          <option value="">All Statuses</option>
          {statuses.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
        </select>
        {(filterProgramme || filterStatus) && (
          <button
            type="button"
            onClick={() => { setFilterProgramme(''); setFilterStatus('') }}
            className="rounded-md px-3 py-2 font-body text-xs text-rust hover:underline"
          >
            Clear Filters
          </button>
        )}
      </div>

      {/* Per-grant table */}
      <SectionCard noPadding>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b-2 border-sand bg-parchment">
                <th className="px-4 py-3 text-left font-heading text-xs font-semibold uppercase tracking-wider text-bark">Reference</th>
                <th className="px-4 py-3 text-left font-heading text-xs font-semibold uppercase tracking-wider text-bark">Programme</th>
                <th className="px-4 py-3 text-left font-heading text-xs font-semibold uppercase tracking-wider text-bark">Status</th>
                <th className="px-4 py-3 text-right font-heading text-xs font-semibold uppercase tracking-wider text-bark">Budget</th>
                <th className="px-4 py-3 text-right font-heading text-xs font-semibold uppercase tracking-wider text-bark">Disbursed</th>
                <th className="px-4 py-3 text-right font-heading text-xs font-semibold uppercase tracking-wider text-bark">Spent</th>
                <th className="px-4 py-3 text-left font-heading text-xs font-semibold uppercase tracking-wider text-bark" style={{ minWidth: 160 }}>Budget Burn</th>
              </tr>
            </thead>
            <tbody className="font-body">
              {filteredGrants.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-sand">No grants found.</td>
                </tr>
              ) : (
                filteredGrants.map((g) => (
                  <tr key={g.application_id} className="border-b border-straw/50 transition-colors hover:bg-parchment/50">
                    <td className="px-4 py-3 font-mono text-sm text-soil">{g.reference_number}</td>
                    <td className="px-4 py-3 text-bark">{g.programme_name}</td>
                    <td className="px-4 py-3"><StatusPill status={g.status} /></td>
                    <td className="px-4 py-3 text-right font-mono">{formatINR(parseFloat(g.budget))}</td>
                    <td className="px-4 py-3 text-right font-mono">{formatINR(parseFloat(g.disbursed))}</td>
                    <td className="px-4 py-3 text-right font-mono">{formatINR(parseFloat(g.spent))}</td>
                    <td className="px-4 py-3">
                      <BudgetBurnBar pct={g.pct_spent} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  )
}

// ── Helper components ───────────────────────────────────────────────────────

function MetricCard({ label, value, detail, color }: { label: string; value: string; detail: string; color: string }) {
  return (
    <div className="overflow-hidden rounded-lg border border-sand bg-parchment shadow-card">
      <div className={cn('h-1', color)} />
      <div className="px-5 py-4">
        <p className="font-body text-xs font-medium uppercase tracking-wider text-bark">{label}</p>
        <p className="mt-1 font-heading text-2xl font-bold text-soil">{value}</p>
        <p className="mt-1 font-mono text-xs text-sand truncate" title={detail}>{detail}</p>
      </div>
    </div>
  )
}

function BudgetBurnBar({ pct }: { pct: number }) {
  const clamped = Math.min(Math.max(pct, 0), 100)
  const barColor = clamped > 90 ? 'bg-rust' : clamped > 70 ? 'bg-amber' : 'bg-clay'

  return (
    <div className="flex items-center gap-2">
      <div className="h-2 flex-1 rounded-full bg-sand/30 overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all', barColor)}
          style={{ width: `${clamped}%` }}
        />
      </div>
      <span className="font-mono text-xs text-bark w-10 text-right">{pct}%</span>
    </div>
  )
}
