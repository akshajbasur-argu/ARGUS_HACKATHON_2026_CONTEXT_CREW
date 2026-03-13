import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiClient } from '@/api/client'
import { PageHeader } from '@/shared/components/PageHeader'
import { StatusPill } from '@/shared/components/StatusPill'
import { LoadingSpinner } from '@/shared/components/LoadingSpinner'
import { Modal } from '@/shared/components/Modal'
import { cn } from '@/shared/utils/cn'
import { formatDate } from '@/shared/utils/formatDate'

/* ── Types ─────────────────────────────────────────────────────────────── */

interface ScoreDim {
  dimension: string
  ai_score: number | null
  human_score: number | null
  human_comment: string | null
}

interface ReviewerScoreSet {
  reviewer_id: string
  reviewer_name: string
  completed_at: string | null
  scores: ScoreDim[]
  composite_score: number | null
}

interface RiskFlag {
  type: string
  description: string
  severity: 'high' | 'medium' | 'low'
}

interface QueueItem {
  application_id: string
  reference_number: string
  programme_name: string
  programme_code: string
  applicant_name: string
  status: string
  reviewer_scores: ReviewerScoreSet[]
  composite_score: number | null
  review_completed_at: string | null
  risk_flags: RiskFlag[]
}

/* ── Sort config ──────────────────────────────────────────────────────── */

type SortKey = 'score' | 'programme' | 'reviewer' | 'date'
type SortDir = 'asc' | 'desc'

/* ── Component ─────────────────────────────────────────────────────────── */

export function DecisionQueue() {
  const [items, setItems] = useState<QueueItem[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('pending')

  // Advanced filters
  const [scoreMin, setScoreMin] = useState('')
  const [scoreMax, setScoreMax] = useState('')
  const [grantTypeFilter, setGrantTypeFilter] = useState('')
  const [reviewerFilter, setReviewerFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  // Sorting
  const [sortKey, setSortKey] = useState<SortKey>('score')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  // Decision modal state
  const [selected, setSelected] = useState<QueueItem | null>(null)
  const [decisionType, setDecisionType] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [deciding, setDeciding] = useState(false)

  const fetchQueue = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (filter) params.set('decision_filter', filter)
      const res = await apiClient.get(`/v1/review/post-review?${params.toString()}`)
      setItems(res.data)
    } catch {
      /* empty */
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => {
    fetchQueue()
  }, [fetchQueue])

  /* ── Derived filter options ────────────────────────────────────────── */
  const grantTypes = useMemo(
    () => [...new Set(items.map((i) => i.programme_code))].sort(),
    [items],
  )
  const reviewerNames = useMemo(() => {
    const names = new Set<string>()
    for (const item of items) {
      for (const rs of item.reviewer_scores) names.add(rs.reviewer_name)
    }
    return [...names].sort()
  }, [items])

  /* ── Filter + sort ─────────────────────────────────────────────────── */
  const filtered = useMemo(() => {
    let list = [...items]

    // Score range
    if (scoreMin) {
      const min = parseFloat(scoreMin)
      if (!isNaN(min)) list = list.filter((i) => i.composite_score != null && Number(i.composite_score) >= min)
    }
    if (scoreMax) {
      const max = parseFloat(scoreMax)
      if (!isNaN(max)) list = list.filter((i) => i.composite_score != null && Number(i.composite_score) <= max)
    }

    // Grant type
    if (grantTypeFilter) {
      list = list.filter((i) => i.programme_code === grantTypeFilter)
    }

    // Reviewer
    if (reviewerFilter) {
      list = list.filter((i) =>
        i.reviewer_scores.some((rs) => rs.reviewer_name === reviewerFilter),
      )
    }

    // Date range
    if (dateFrom) {
      const from = new Date(dateFrom)
      list = list.filter((i) => i.review_completed_at && new Date(i.review_completed_at) >= from)
    }
    if (dateTo) {
      const to = new Date(dateTo + 'T23:59:59')
      list = list.filter((i) => i.review_completed_at && new Date(i.review_completed_at) <= to)
    }

    // Sort
    list.sort((a, b) => {
      let cmp = 0
      switch (sortKey) {
        case 'score':
          cmp = (Number(a.composite_score) || 0) - (Number(b.composite_score) || 0)
          break
        case 'programme':
          cmp = a.programme_code.localeCompare(b.programme_code)
          break
        case 'reviewer':
          cmp = (a.reviewer_scores[0]?.reviewer_name ?? '').localeCompare(
            b.reviewer_scores[0]?.reviewer_name ?? '',
          )
          break
        case 'date':
          cmp =
            new Date(a.review_completed_at ?? 0).getTime() -
            new Date(b.review_completed_at ?? 0).getTime()
          break
      }
      return sortDir === 'desc' ? -cmp : cmp
    })

    return list
  }, [items, scoreMin, scoreMax, grantTypeFilter, reviewerFilter, dateFrom, dateTo, sortKey, sortDir])

  const hasFilters = scoreMin || scoreMax || grantTypeFilter || reviewerFilter || dateFrom || dateTo

  function clearFilters() {
    setScoreMin('')
    setScoreMax('')
    setGrantTypeFilter('')
    setReviewerFilter('')
    setDateFrom('')
    setDateTo('')
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  /* ── Submit decision ─────────────────────────────────────────────── */
  async function submitDecision() {
    if (!selected || !decisionType || !reason.trim()) return
    setDeciding(true)
    try {
      await apiClient.post(`/v1/review/decisions/${selected.application_id}`, {
        decision: decisionType,
        reason: reason.trim(),
      })
      setSelected(null)
      setDecisionType(null)
      setReason('')
      await fetchQueue()
    } catch {
      /* empty */
    } finally {
      setDeciding(false)
    }
  }

  /* ── Sort header helper ────────────────────────────────────────────── */
  function SortHeader({ label, sKey }: { label: string; sKey: SortKey }) {
    const active = sortKey === sKey
    return (
      <button
        type="button"
        onClick={() => toggleSort(sKey)}
        className={cn(
          'flex items-center gap-1 font-heading text-xs font-semibold uppercase tracking-wider',
          active ? 'text-clay' : 'text-bark hover:text-clay',
        )}
      >
        {label}
        {active && (
          <svg className={cn('h-3 w-3', sortDir === 'asc' && 'rotate-180')} viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        )}
      </button>
    )
  }

  /* ── Render ──────────────────────────────────────────────────────── */
  return (
    <div>
      <PageHeader
        title="Post-Review Decisions"
        breadcrumbs={[{ label: 'Decisions' }]}
      />

      {/* Decision status filter */}
      <div className="mb-4 flex gap-2">
        {[
          { value: 'pending', label: 'Pending' },
          { value: 'approved', label: 'Approved' },
          { value: 'rejected', label: 'Rejected' },
          { value: 'waitlisted', label: 'Waitlisted' },
        ].map((opt) => (
          <button
            key={opt.value}
            onClick={() => setFilter(opt.value)}
            className={cn(
              'rounded-lg border px-3 py-1.5 font-heading text-xs font-medium transition-colors',
              filter === opt.value
                ? 'border-clay bg-clay text-cream'
                : 'border-sand bg-cream text-bark hover:border-clay',
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Advanced filters */}
      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border border-sand bg-parchment px-4 py-3">
        <div>
          <label className="block font-body text-[10px] font-medium text-bark mb-1">Score Range</label>
          <div className="flex items-center gap-1">
            <input
              type="number"
              step="0.1"
              min="0"
              max="5"
              value={scoreMin}
              onChange={(e) => setScoreMin(e.target.value)}
              placeholder="Min"
              className="w-16 rounded-md border border-sand bg-cream px-2 py-1.5 font-mono text-xs text-soil focus:border-clay focus:outline-none"
            />
            <span className="text-sand text-xs">–</span>
            <input
              type="number"
              step="0.1"
              min="0"
              max="5"
              value={scoreMax}
              onChange={(e) => setScoreMax(e.target.value)}
              placeholder="Max"
              className="w-16 rounded-md border border-sand bg-cream px-2 py-1.5 font-mono text-xs text-soil focus:border-clay focus:outline-none"
            />
          </div>
        </div>

        <div>
          <label className="block font-body text-[10px] font-medium text-bark mb-1">Grant Type</label>
          <select
            value={grantTypeFilter}
            onChange={(e) => setGrantTypeFilter(e.target.value)}
            className="rounded-md border border-sand bg-cream px-2 py-1.5 font-body text-xs text-soil focus:border-clay focus:outline-none"
          >
            <option value="">All</option>
            {grantTypes.map((gt) => (
              <option key={gt} value={gt}>{gt}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block font-body text-[10px] font-medium text-bark mb-1">Reviewer</label>
          <select
            value={reviewerFilter}
            onChange={(e) => setReviewerFilter(e.target.value)}
            className="rounded-md border border-sand bg-cream px-2 py-1.5 font-body text-xs text-soil focus:border-clay focus:outline-none"
          >
            <option value="">All</option>
            {reviewerNames.map((rn) => (
              <option key={rn} value={rn}>{rn}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block font-body text-[10px] font-medium text-bark mb-1">Date Range</label>
          <div className="flex items-center gap-1">
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="rounded-md border border-sand bg-cream px-2 py-1.5 font-mono text-xs text-soil focus:border-clay focus:outline-none"
            />
            <span className="text-sand text-xs">–</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="rounded-md border border-sand bg-cream px-2 py-1.5 font-mono text-xs text-soil focus:border-clay focus:outline-none"
            />
          </div>
        </div>

        {hasFilters && (
          <button
            type="button"
            onClick={clearFilters}
            className="rounded-md px-3 py-1.5 font-body text-xs text-rust hover:underline"
          >
            Clear Filters
          </button>
        )}
      </div>

      {/* Sort bar */}
      <div className="mb-3 flex items-center gap-4 px-1">
        <span className="font-body text-[10px] text-sand uppercase tracking-wider">Sort by:</span>
        <SortHeader label="Score" sKey="score" />
        <SortHeader label="Grant Type" sKey="programme" />
        <SortHeader label="Reviewer" sKey="reviewer" />
        <SortHeader label="Date" sKey="date" />
      </div>

      {/* Queue */}
      {loading ? (
        <div className="flex h-40 items-center justify-center">
          <LoadingSpinner label="Loading decisions queue..." />
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-12 text-center">
          <p className="font-body text-sm text-sand">
            No applications match the current filters.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((item) => (
            <div
              key={item.application_id}
              className="rounded-lg border border-sand bg-white shadow-card"
            >
              {/* Header */}
              <div className="flex flex-wrap items-center gap-3 border-b border-straw px-5 py-3">
                <span className="font-mono text-sm font-semibold text-clay">
                  {item.reference_number}
                </span>
                <span className="font-body text-sm text-bark">
                  {item.programme_name}
                </span>
                <span className="font-body text-xs text-sand">
                  {item.applicant_name}
                </span>
                {item.review_completed_at && (
                  <span className="font-mono text-[10px] text-sand">
                    {formatDate(item.review_completed_at)}
                  </span>
                )}
                <div className="ml-auto flex items-center gap-3">
                  <StatusPill status={item.status} />
                  {item.composite_score != null && (
                    <span className="font-mono text-sm font-bold text-soil">
                      {Number(item.composite_score).toFixed(2)}
                    </span>
                  )}
                </div>
              </div>

              {/* Risk flags */}
              {item.risk_flags && item.risk_flags.length > 0 && (
                <div className="border-b border-straw/50 px-5 py-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-body text-[10px] font-medium uppercase tracking-wider text-sand">
                      Risk Flags ({item.risk_flags.length})
                    </span>
                    {item.risk_flags.map((flag, i) => (
                      <span
                        key={i}
                        className={cn(
                          'inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-body text-[10px] font-medium',
                          flag.severity === 'high'
                            ? 'bg-rust/10 text-rust'
                            : flag.severity === 'medium'
                              ? 'bg-amber/10 text-amber'
                              : 'bg-sand/20 text-bark',
                        )}
                      >
                        <span
                          className={cn(
                            'inline-block h-1.5 w-1.5 rounded-full',
                            flag.severity === 'high'
                              ? 'bg-rust'
                              : flag.severity === 'medium'
                                ? 'bg-amber'
                                : 'bg-sand',
                          )}
                        />
                        {flag.description}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Reviewer scores comparison */}
              <div className="px-5 py-3">
                {/* EIG side-by-side comparison */}
                {item.programme_code === 'EIG' && item.reviewer_scores.length >= 2 && item.reviewer_scores.every(rs => rs.completed_at) ? (
                  <div>
                    <p className="mb-2 font-heading text-xs font-semibold text-bark">
                      EIG Reviewer Comparison
                    </p>
                    <div className="overflow-x-auto rounded-lg border border-sand">
                      <table className="w-full text-left font-body text-xs">
                        <thead>
                          <tr className="bg-soil/5 text-sand">
                            <th className="px-3 py-2 font-medium">Dimension</th>
                            <th className="px-3 py-2 font-medium text-center">{item.reviewer_scores[0].reviewer_name}</th>
                            <th className="px-3 py-2 font-medium text-center">{item.reviewer_scores[1].reviewer_name}</th>
                            <th className="px-3 py-2 font-medium text-center">Diff</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(() => {
                            const dims = new Set<string>()
                            for (const rs of item.reviewer_scores) {
                              for (const s of rs.scores) dims.add(s.dimension)
                            }
                            return Array.from(dims).map((dim) => {
                              const s1 = item.reviewer_scores[0].scores.find(s => s.dimension === dim)
                              const s2 = item.reviewer_scores[1].scores.find(s => s.dimension === dim)
                              const v1 = s1?.human_score != null ? Number(s1.human_score) : null
                              const v2 = s2?.human_score != null ? Number(s2.human_score) : null
                              const diff = v1 != null && v2 != null ? Math.abs(v1 - v2) : null
                              const isHighDiff = diff != null && diff >= 2

                              return (
                                <tr
                                  key={dim}
                                  className={cn(
                                    'border-b border-straw/40',
                                    isHighDiff && 'bg-amber/10',
                                  )}
                                >
                                  <td className="px-3 py-2 capitalize text-bark">
                                    {dim.replace(/_/g, ' ')}
                                  </td>
                                  <td className="px-3 py-2 text-center font-mono text-soil">
                                    {v1 ?? '—'}
                                  </td>
                                  <td className="px-3 py-2 text-center font-mono text-soil">
                                    {v2 ?? '—'}
                                  </td>
                                  <td className={cn(
                                    'px-3 py-2 text-center font-mono font-semibold',
                                    isHighDiff ? 'text-amber' : 'text-sand',
                                  )}>
                                    {diff != null ? diff : '—'}
                                  </td>
                                </tr>
                              )
                            })
                          })()}
                          {/* Composite row */}
                          <tr className="bg-soil/5 font-semibold">
                            <td className="px-3 py-2 text-bark">Composite</td>
                            <td className="px-3 py-2 text-center font-mono text-soil">
                              {item.reviewer_scores[0].composite_score != null
                                ? Number(item.reviewer_scores[0].composite_score).toFixed(2)
                                : '—'}
                            </td>
                            <td className="px-3 py-2 text-center font-mono text-soil">
                              {item.reviewer_scores[1].composite_score != null
                                ? Number(item.reviewer_scores[1].composite_score).toFixed(2)
                                : '—'}
                            </td>
                            <td className="px-3 py-2 text-center font-mono text-soil">
                              {item.composite_score != null
                                ? `Avg: ${Number(item.composite_score).toFixed(2)}`
                                : '—'}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  /* Standard reviewer display for non-EIG or single reviewer */
                  <div>
                    {item.reviewer_scores.length > 1 && (
                      <p className="mb-2 font-body text-xs font-medium text-sand">
                        Reviewer Comparison ({item.programme_code} — {item.reviewer_scores.length} reviewers)
                      </p>
                    )}

                    <div className="overflow-x-auto">
                      <table className="w-full text-left font-body text-xs">
                        <thead>
                          <tr className="border-b border-straw text-sand">
                            <th className="pb-1.5 pr-3 font-medium">Dimension</th>
                            {item.reviewer_scores.map((rs) => (
                              <th key={rs.reviewer_id} className="pb-1.5 pr-3 font-medium">
                                {rs.reviewer_name}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {(() => {
                            const dims = new Set<string>()
                            for (const rs of item.reviewer_scores) {
                              for (const s of rs.scores) dims.add(s.dimension)
                            }
                            return Array.from(dims).map((dim) => (
                              <tr key={dim} className="border-b border-straw/40">
                                <td className="py-1.5 pr-3 capitalize text-bark">
                                  {dim.replace(/_/g, ' ')}
                                </td>
                                {item.reviewer_scores.map((rs) => {
                                  const score = rs.scores.find((s) => s.dimension === dim)
                                  return (
                                    <td
                                      key={rs.reviewer_id}
                                      className="py-1.5 pr-3 font-mono text-soil"
                                    >
                                      {score?.human_score != null ? Number(score.human_score) : '—'}
                                      {score?.ai_score != null && (
                                        <span className="ml-1 text-sand">
                                          (AI: {Number(score.ai_score)})
                                        </span>
                                      )}
                                    </td>
                                  )
                                })}
                              </tr>
                            ))
                          })()}
                          {/* Composite row */}
                          <tr className="font-semibold">
                            <td className="pt-2 text-bark">Composite</td>
                            {item.reviewer_scores.map((rs) => (
                              <td key={rs.reviewer_id} className="pt-2 font-mono text-soil">
                                {rs.composite_score != null
                                  ? Number(rs.composite_score).toFixed(2)
                                  : '—'}
                              </td>
                            ))}
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Decision button — only for pending */}
                {item.status === 'review_complete' && (
                  <div className="mt-3 flex justify-end">
                    <button
                      onClick={() => {
                        setSelected(item)
                        setDecisionType(null)
                        setReason('')
                      }}
                      className="rounded-lg bg-soil px-4 py-2 font-heading text-xs font-semibold text-cream transition-colors hover:bg-bark"
                    >
                      Record Decision
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Decision modal */}
      <Modal
        open={selected != null}
        onClose={() => setSelected(null)}
        title={`Decision — ${selected?.reference_number ?? ''}`}
        width="md"
      >
        {selected && (
          <div className="space-y-4 p-5">
            <p className="font-body text-sm text-bark">
              {selected.programme_name} &middot; {selected.applicant_name}
              {selected.composite_score != null && (
                <span className="ml-2 font-mono font-bold">
                  Score: {Number(selected.composite_score).toFixed(2)}
                </span>
              )}
            </p>

            {/* Decision buttons */}
            <div className="flex gap-2">
              <button
                onClick={() => setDecisionType('approved')}
                className={cn(
                  'flex-1 rounded-lg border px-3 py-2 font-heading text-sm font-semibold transition-colors',
                  decisionType === 'approved'
                    ? 'border-moss bg-moss text-cream'
                    : 'border-moss/40 bg-moss/10 text-moss hover:bg-moss/20',
                )}
              >
                Approve
              </button>
              <button
                onClick={() => setDecisionType('rejected')}
                className={cn(
                  'flex-1 rounded-lg border px-3 py-2 font-heading text-sm font-semibold transition-colors',
                  decisionType === 'rejected'
                    ? 'border-rust bg-rust text-cream'
                    : 'border-rust/40 bg-rust/10 text-rust hover:bg-rust/20',
                )}
              >
                Reject
              </button>
              <button
                onClick={() => setDecisionType('waitlisted')}
                className={cn(
                  'flex-1 rounded-lg border px-3 py-2 font-heading text-sm font-semibold transition-colors',
                  decisionType === 'waitlisted'
                    ? 'border-amber bg-amber text-cream'
                    : 'border-amber/40 bg-amber/10 text-amber hover:bg-amber/20',
                )}
              >
                Waitlist
              </button>
            </div>

            {/* Reason textarea */}
            {decisionType && (
              <div className="space-y-1">
                <label className="font-body text-xs font-medium text-bark">
                  Reason *
                </label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={4}
                  className="w-full rounded-md border border-sand bg-cream px-3 py-2 font-body text-sm text-soil placeholder:text-sand/60 focus:border-clay focus:outline-none focus:ring-[3px] focus:ring-clay/30"
                  placeholder="Provide a mandatory reason for this decision..."
                />
              </div>
            )}

            {/* Submit */}
            {decisionType && (
              <button
                onClick={submitDecision}
                disabled={deciding || reason.trim().length < 5}
                className="w-full rounded-lg bg-soil px-4 py-2.5 font-heading text-sm font-semibold text-cream transition-colors hover:bg-bark disabled:cursor-not-allowed disabled:opacity-50"
              >
                {deciding ? 'Saving...' : `Confirm ${decisionType.charAt(0).toUpperCase() + decisionType.slice(1)}`}
              </button>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}
