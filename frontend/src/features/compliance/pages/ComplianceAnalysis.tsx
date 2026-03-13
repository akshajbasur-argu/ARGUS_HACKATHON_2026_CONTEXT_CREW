import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { PageHeader } from '@/shared/components/PageHeader'
import { SectionCard } from '@/shared/components/SectionCard'
import { StatusPill } from '@/shared/components/StatusPill'
import { AIBadge } from '@/shared/components/AIBadge'
import { FormTextarea } from '@/shared/components/FormField'
import { LoadingSpinner } from '@/shared/components/LoadingSpinner'
import { ConfirmDialog } from '@/shared/components/ConfirmDialog'
import { cn } from '@/shared/utils/cn'
import { formatINR } from '@/shared/utils/formatCurrency'
import { formatDateTime } from '@/shared/utils/formatDate'
import { apiClient } from '@/api/client'

interface CompAnalysis {
  id: string
  content_rating: string
  financial_flags: { key: string; message: string; severity: string }[]
  content_flags: { key: string; message: string; severity: string }[]
  recommended_action: string | null
  created_at: string
}

interface ReportData {
  id: string
  application_id: string
  report_type: string
  period_label: string
  form_data: Record<string, unknown>
  submitted_at: string
  reviewed_at: string | null
  status: string
  compliance_analysis: CompAnalysis | null
}

const RATING_STYLES: Record<string, { bg: string; label: string }> = {
  satisfactory:    { bg: 'bg-moss/15 text-moss border-moss/40',   label: 'Satisfactory' },
  needs_attention: { bg: 'bg-amber/15 text-amber border-amber/40', label: 'Needs Clarification' },
  critical:        { bg: 'bg-rust/15 text-rust border-rust/40',    label: 'Concerns Found' },
}

const FLAG_ICONS: Record<string, { icon: string; color: string }> = {
  low:    { icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z', color: 'text-moss' },
  medium: { icon: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z', color: 'text-amber' },
  high:   { icon: 'M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z', color: 'text-rust' },
}

export function ComplianceAnalysis() {
  const { reportId } = useParams<{ reportId: string }>()

  const [report, setReport] = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Decision state
  const [notes, setNotes] = useState('')
  const [disbursementHold, setDisbursementHold] = useState(false)
  const [deciding, setDeciding] = useState(false)
  const [decided, setDecided] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [pendingAction, setPendingAction] = useState<string>('')

  const fetchReport = useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiClient.get(`/v1/compliance/staff/reports/${reportId}`)
      setReport(res.data)
    } catch {
      setError('Failed to load report.')
    } finally {
      setLoading(false)
    }
  }, [reportId])

  useEffect(() => {
    fetchReport()
  }, [fetchReport])

  const handleDecision = useCallback((action: string) => {
    if (!notes.trim()) {
      setError('Please provide review notes.')
      return
    }
    setPendingAction(action)
    setConfirmOpen(true)
  }, [notes])

  const confirmDecision = useCallback(async () => {
    setDeciding(true)
    setError('')
    try {
      await apiClient.post(`/v1/compliance/staff/reports/${reportId}/decide`, {
        action: pendingAction,
        severity: disbursementHold ? 'disbursement_hold' : pendingAction === 'compliance_action' ? 'warning' : null,
        notes: notes.trim(),
      })
      setDecided(true)
      setConfirmOpen(false)
      fetchReport()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(msg || 'Failed to record decision.')
    } finally {
      setDeciding(false)
    }
  }, [reportId, pendingAction, disbursementHold, notes, fetchReport])

  if (loading) {
    return <div className="mx-auto max-w-6xl py-12"><LoadingSpinner label="Loading compliance analysis..." /></div>
  }

  if (!report) {
    return (
      <div className="mx-auto max-w-6xl">
        <PageHeader title="Compliance Review" breadcrumbs={[{ label: 'Reports', href: '/staff/reports' }, { label: 'Analysis' }]} />
        <p className="font-body text-sm text-rust">{error || 'Report not found.'}</p>
      </div>
    )
  }

  const analysis = report.compliance_analysis
  const formData = report.form_data || {}

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Compliance Review"
        breadcrumbs={[
          { label: 'Reports', href: '/staff/reports' },
          { label: report.period_label },
        ]}
      />

      {/* Report meta */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <StatusPill status={report.status} />
        <span className="font-mono text-xs text-bark">
          {report.report_type} report | Submitted {formatDateTime(report.submitted_at)}
        </span>
      </div>

      {/* Two-panel layout */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* LEFT: AI Analysis */}
        <div className="space-y-6">
          <SectionCard title="AI Compliance Analysis">
            {analysis ? (
              <div className="space-y-5">
                <div className="flex items-center gap-3">
                  <AIBadge label="AI Analysis" />
                  <span className="font-mono text-xs text-bark">
                    Generated {formatDateTime(analysis.created_at)}
                  </span>
                </div>

                {/* Overall rating */}
                <div>
                  <p className="mb-2 font-body text-xs font-medium uppercase tracking-wider text-bark">Overall Rating</p>
                  <span className={cn(
                    'inline-flex items-center rounded-pill border px-3 py-1',
                    'font-mono text-xs font-semibold uppercase tracking-wide',
                    RATING_STYLES[analysis.content_rating]?.bg || 'bg-sand/20 text-soil border-sand',
                  )}>
                    {RATING_STYLES[analysis.content_rating]?.label || analysis.content_rating}
                  </span>
                </div>

                {/* Content checks */}
                <div>
                  <p className="mb-2 font-body text-xs font-medium uppercase tracking-wider text-bark">Content Analysis</p>
                  {analysis.content_flags.length === 0 ? (
                    <p className="font-body text-sm text-moss">No content concerns found.</p>
                  ) : (
                    <div className="space-y-2">
                      {analysis.content_flags.map((flag, i) => {
                        const icon = FLAG_ICONS[flag.severity] || FLAG_ICONS.low
                        return (
                          <div key={i} className="flex items-start gap-2 rounded-md bg-cream p-3 border border-sand">
                            <svg className={cn('mt-0.5 h-5 w-5 flex-shrink-0', icon.color)} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                              <path strokeLinecap="round" strokeLinejoin="round" d={icon.icon} />
                            </svg>
                            <div>
                              <p className="font-body text-sm font-medium text-soil">{flag.key.replace(/_/g, ' ')}</p>
                              <p className="font-body text-xs text-bark">{flag.message}</p>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>

                {/* Financial flags */}
                <div>
                  <p className="mb-2 font-body text-xs font-medium uppercase tracking-wider text-bark">Financial Analysis</p>
                  {analysis.financial_flags.length === 0 ? (
                    <p className="font-body text-sm text-moss">No financial flags raised.</p>
                  ) : (
                    <div className="space-y-2">
                      {analysis.financial_flags.map((flag, i) => {
                        const icon = FLAG_ICONS[flag.severity] || FLAG_ICONS.medium
                        return (
                          <div key={i} className="flex items-start gap-2 rounded-md bg-cream p-3 border border-sand">
                            <svg className={cn('mt-0.5 h-5 w-5 flex-shrink-0', icon.color)} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                              <path strokeLinecap="round" strokeLinejoin="round" d={icon.icon} />
                            </svg>
                            <div>
                              <p className="font-body text-sm font-medium text-soil">{flag.key.replace(/_/g, ' ')}</p>
                              <p className="font-body text-xs text-bark">{flag.message}</p>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>

                {/* Recommended action */}
                {analysis.recommended_action && (
                  <div className="rounded-md border border-sand bg-parchment p-3">
                    <p className="font-body text-xs font-medium uppercase tracking-wider text-bark mb-1">Recommended Action</p>
                    <p className="font-body text-sm text-soil">{analysis.recommended_action}</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="py-6 text-center">
                <LoadingSpinner size="sm" label="AI analysis pending..." />
              </div>
            )}
          </SectionCard>

          {/* Financial analysis table - budget vs actuals */}
          {Array.isArray(formData.expenditures) && formData.expenditures.length > 0 && (
            <SectionCard title="Budget vs Actuals">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b-2 border-sand bg-parchment">
                      <th className="px-3 py-2 text-left font-heading text-xs font-semibold uppercase text-bark">Category</th>
                      <th className="px-3 py-2 text-right font-heading text-xs font-semibold uppercase text-bark">This Period</th>
                      <th className="px-3 py-2 text-right font-heading text-xs font-semibold uppercase text-bark">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(formData.expenditures as { category: string; amount_inr: number; description: string }[]).map((exp, i) => (
                      <tr key={i} className={cn('border-b border-straw/50', i % 2 === 0 && 'bg-parchment/50')}>
                        <td className="px-3 py-2 font-body text-soil">{exp.category}</td>
                        <td className="px-3 py-2 text-right font-body text-bark">{exp.description}</td>
                        <td className="px-3 py-2 text-right font-mono text-soil">{formatINR(exp.amount_inr)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </SectionCard>
          )}
        </div>

        {/* RIGHT: Original report */}
        <div className="space-y-6">
          <SectionCard title="Submitted Report">
            <div className="space-y-4">
              {!!formData.activities_summary && (
                <div>
                  <p className="mb-1 font-body text-xs font-medium uppercase tracking-wider text-bark">Activities Summary</p>
                  <p className="font-body text-sm text-soil leading-relaxed">{String(formData.activities_summary)}</p>
                </div>
              )}
              {!!formData.outcome_progress && (
                <div>
                  <p className="mb-1 font-body text-xs font-medium uppercase tracking-wider text-bark">Outcome Progress</p>
                  <p className="font-body text-sm text-soil leading-relaxed">{String(formData.outcome_progress)}</p>
                </div>
              )}
              {!!formData.challenges && (
                <div>
                  <p className="mb-1 font-body text-xs font-medium uppercase tracking-wider text-bark">Challenges & Risks</p>
                  <p className="font-body text-sm text-soil leading-relaxed">{String(formData.challenges)}</p>
                </div>
              )}
              {!!formData.next_steps && (
                <div>
                  <p className="mb-1 font-body text-xs font-medium uppercase tracking-wider text-bark">Next Steps</p>
                  <p className="font-body text-sm text-soil leading-relaxed">{String(formData.next_steps)}</p>
                </div>
              )}
              {!!formData.financial_summary && (
                <div>
                  <p className="mb-1 font-body text-xs font-medium uppercase tracking-wider text-bark">Financial Summary</p>
                  <p className="font-body text-sm text-soil leading-relaxed">{String(formData.financial_summary)}</p>
                </div>
              )}
              {!!formData.variance_explanation && (
                <div>
                  <p className="mb-1 font-body text-xs font-medium uppercase tracking-wider text-bark">Variance Explanation</p>
                  <p className="font-body text-sm text-soil leading-relaxed">{String(formData.variance_explanation)}</p>
                </div>
              )}
            </div>
          </SectionCard>

          {/* Decision panel */}
          {!decided && report.status !== 'approved' && report.status !== 'rejected' && (
            <SectionCard title="Review Decision">
              <div className="space-y-4">
                <FormTextarea
                  label="Review Notes"
                  required
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Provide your review notes and rationale..."
                  rows={4}
                />

                {/* Disbursement hold toggle */}
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={disbursementHold}
                    onChange={(e) => setDisbursementHold(e.target.checked)}
                    className="h-4 w-4 rounded border-sand text-rust focus:ring-rust/30"
                  />
                  <span className="font-body text-sm text-bark">
                    Place disbursement hold (notifies Finance Officer)
                  </span>
                </label>

                {error && (
                  <div className="rounded-md border border-rust/30 bg-rust/10 px-3 py-2">
                    <p className="font-body text-xs text-rust">{error}</p>
                  </div>
                )}

                <div className="flex flex-wrap gap-3">
                  <button type="button" onClick={() => handleDecision('approved')} className="rounded-md bg-moss px-4 py-2 font-body text-sm font-medium text-cream transition-colors hover:bg-moss/90">
                    Approve
                  </button>
                  <button type="button" onClick={() => handleDecision('clarification')} className="rounded-md bg-amber px-4 py-2 font-body text-sm font-medium text-cream transition-colors hover:bg-amber/90">
                    Request Clarification
                  </button>
                  <button type="button" onClick={() => handleDecision('compliance_action')} className="rounded-md bg-rust px-4 py-2 font-body text-sm font-medium text-cream transition-colors hover:bg-rust/90">
                    Compliance Action
                  </button>
                </div>
              </div>
            </SectionCard>
          )}

          {decided && (
            <SectionCard title="Decision Recorded">
              <div className="rounded-md border border-moss/30 bg-moss/10 px-4 py-3">
                <p className="font-body text-sm text-moss font-medium">Decision recorded successfully.</p>
              </div>
            </SectionCard>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={confirmDecision}
        title="Confirm Decision"
        message={`Are you sure you want to ${pendingAction === 'approved' ? 'approve' : pendingAction === 'clarification' ? 'request clarification for' : 'take compliance action on'} this report?${disbursementHold ? ' This will also place a disbursement hold.' : ''}`}
        confirmLabel="Confirm"
        variant={pendingAction === 'approved' ? 'default' : pendingAction === 'clarification' ? 'warning' : 'danger'}
        loading={deciding}
      />
    </div>
  )
}
