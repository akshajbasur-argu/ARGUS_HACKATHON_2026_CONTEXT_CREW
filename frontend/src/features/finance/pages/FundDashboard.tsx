import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { PageHeader } from '@/shared/components/PageHeader'
import { SectionCard } from '@/shared/components/SectionCard'
import { StatusPill } from '@/shared/components/StatusPill'
import { LoadingSpinner } from '@/shared/components/LoadingSpinner'
import { cn } from '@/shared/utils/cn'
import { formatINR, formatINRCompact } from '@/shared/utils/formatCurrency'
import { apiClient } from '@/api/client'

// ── Types ──────────────────────────────────────────────────────────────────

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

interface ProgrammeSummary {
  programme_code: string
  programme_name: string
  committed: string
  disbursed: string
  spent: string
  grant_count: number
  utilisation_pct: number
}

interface ProgrammeDashboardData {
  total_committed_inr: string
  total_disbursed_inr: string
  total_reported_expenditure_inr: string
  grants_by_status: Record<string, number>
  per_programme: ProgrammeSummary[]
}

// ── Tabs ───────────────────────────────────────────────────────────────────

type TabKey = 'grants' | 'programme'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'grants', label: 'Grant Overview' },
  { key: 'programme', label: 'Programme Overview' },
]

// ── Component ──────────────────────────────────────────────────────────────

export function FundDashboard() {
  const [activeTab, setActiveTab] = useState<TabKey>('grants')
  const [data, setData] = useState<DashboardData | null>(null)
  const [progData, setProgData] = useState<ProgrammeDashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [exportOpen, setExportOpen] = useState(false)
  const exportRef = useRef<HTMLDivElement>(null)

  // Filters (grant tab)
  const [filterProgramme, setFilterProgramme] = useState('')
  const [filterStatus, setFilterStatus] = useState('')

  const fetchDashboard = useCallback(async () => {
    setLoading(true)
    try {
      const [grantRes, progRes] = await Promise.all([
        apiClient.get('/v1/finance/dashboard'),
        apiClient.get('/v1/finance/dashboard/programme'),
      ])
      setData(grantRes.data)
      setProgData(progRes.data)
    } catch {
      setError('Failed to load dashboard data.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchDashboard()
  }, [fetchDashboard])

  // Close export dropdown on click outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) {
        setExportOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

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

  // Server-side export (PDF or CSV)
  const handleExport = useCallback(async (format: 'csv' | 'pdf') => {
    setExportOpen(false)
    const view = activeTab === 'programme' ? 'programme' : 'grant'
    try {
      const res = await apiClient.get('/v1/finance/dashboard/export', {
        params: { format, view },
        responseType: 'blob',
      })
      const ext = format
      const blob = new Blob([res.data], { type: format === 'pdf' ? 'application/pdf' : 'text/csv' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `fund_report_${view}.${ext}`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      setError('Export failed. Please try again.')
    }
  }, [activeTab])

  // Chart data for programme tab
  const chartData = useMemo(() => {
    if (!progData) return []
    return progData.per_programme.map((p) => ({
      name: p.programme_code,
      Committed: parseFloat(p.committed),
      Disbursed: parseFloat(p.disbursed),
      Spent: parseFloat(p.spent),
    }))
  }, [progData])

  if (loading) {
    return <div className="mx-auto max-w-6xl py-12"><LoadingSpinner label="Loading dashboard..." /></div>
  }

  if (error || !data || !progData) {
    return (
      <div className="mx-auto max-w-6xl">
        <PageHeader title="Fund Dashboard" breadcrumbs={[{ label: 'Dashboard' }]} />
        <p className="font-body text-sm text-rust">{error}</p>
      </div>
    )
  }

  const activeGrants = Object.entries(progData.grants_by_status)
    .filter(([s]) => s === 'active')
    .reduce((sum, [, n]) => sum + n, 0)

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Fund Dashboard"
        breadcrumbs={[{ label: 'Finance' }, { label: 'Dashboard' }]}
        action={
          <div ref={exportRef} className="relative">
            <button
              type="button"
              onClick={() => setExportOpen(!exportOpen)}
              className={cn(
                'rounded-md border border-sand bg-cream px-4 py-2',
                'font-body text-sm font-medium text-bark',
                'transition-colors hover:bg-parchment',
                'flex items-center gap-1.5',
              )}
            >
              Export
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {exportOpen && (
              <div className="absolute right-0 top-full z-10 mt-1 w-44 rounded-md border border-sand bg-cream shadow-card">
                <button
                  type="button"
                  onClick={() => handleExport('csv')}
                  className="block w-full px-4 py-2.5 text-left font-body text-sm text-bark hover:bg-parchment"
                >
                  Export as CSV
                </button>
                <button
                  type="button"
                  onClick={() => handleExport('pdf')}
                  className="block w-full px-4 py-2.5 text-left font-body text-sm text-bark hover:bg-parchment"
                >
                  Export as PDF
                </button>
              </div>
            )}
          </div>
        }
      />

      {/* Tabs */}
      <div className="mb-6 flex gap-1 border-b border-sand">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              'px-4 py-2.5 font-heading text-sm font-medium transition-colors',
              activeTab === tab.key
                ? 'border-b-2 border-clay text-clay'
                : 'text-sand hover:text-bark',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Grant Overview Tab ──────────────────────────────────────────── */}
      {activeTab === 'grants' && (
        <>
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
        </>
      )}

      {/* ── Programme Overview Tab ──────────────────────────────────────── */}
      {activeTab === 'programme' && (
        <>
          {/* Metric cards */}
          <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              label="Total Committed"
              value={formatINRCompact(parseFloat(progData.total_committed_inr))}
              detail={formatINR(parseFloat(progData.total_committed_inr))}
              color="bg-clay"
            />
            <MetricCard
              label="Total Disbursed"
              value={formatINRCompact(parseFloat(progData.total_disbursed_inr))}
              detail={formatINR(parseFloat(progData.total_disbursed_inr))}
              color="bg-moss"
            />
            <MetricCard
              label="Reported Expenditure"
              value={formatINRCompact(parseFloat(progData.total_reported_expenditure_inr))}
              detail={formatINR(parseFloat(progData.total_reported_expenditure_inr))}
              color="bg-water"
            />
            <MetricCard
              label="Active Grants"
              value={String(activeGrants)}
              detail={Object.entries(progData.grants_by_status).map(([s, n]) => `${s}: ${n}`).join(', ')}
              color="bg-amber"
            />
          </div>

          {/* Bar chart */}
          <SectionCard title="Fund Allocation by Programme">
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 30, left: 20, bottom: 5 }}>
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis tickFormatter={(v: number) => `${(v / 100000).toFixed(0)}L`} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v) => formatINR(Number(v))} />
                  <Legend />
                  <Bar dataKey="Committed" fill="#3B2F1E" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="Disbursed" fill="#8B5E3C" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="Spent" fill="#4A6741" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </SectionCard>

          {/* Per-programme table */}
          <div className="mt-6">
            <SectionCard noPadding>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b-2 border-sand bg-parchment">
                      <th className="px-4 py-3 text-left font-heading text-xs font-semibold uppercase tracking-wider text-bark">Programme</th>
                      <th className="px-4 py-3 text-right font-heading text-xs font-semibold uppercase tracking-wider text-bark">Grants</th>
                      <th className="px-4 py-3 text-right font-heading text-xs font-semibold uppercase tracking-wider text-bark">Committed</th>
                      <th className="px-4 py-3 text-right font-heading text-xs font-semibold uppercase tracking-wider text-bark">Disbursed</th>
                      <th className="px-4 py-3 text-right font-heading text-xs font-semibold uppercase tracking-wider text-bark">Utilisation %</th>
                    </tr>
                  </thead>
                  <tbody className="font-body">
                    {progData.per_programme.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-12 text-center text-sand">No programme data available.</td>
                      </tr>
                    ) : (
                      progData.per_programme.map((p) => (
                        <tr key={p.programme_code} className="border-b border-straw/50 transition-colors hover:bg-parchment/50">
                          <td className="px-4 py-3">
                            <div className="font-heading text-sm font-semibold text-soil">{p.programme_code}</div>
                            <div className="font-body text-xs text-bark">{p.programme_name}</div>
                          </td>
                          <td className="px-4 py-3 text-right font-mono">{p.grant_count}</td>
                          <td className="px-4 py-3 text-right font-mono">{formatINR(parseFloat(p.committed))}</td>
                          <td className="px-4 py-3 text-right font-mono">{formatINR(parseFloat(p.disbursed))}</td>
                          <td className="px-4 py-3 text-right">
                            <BudgetBurnBar pct={p.utilisation_pct} />
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </SectionCard>
          </div>
        </>
      )}
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
