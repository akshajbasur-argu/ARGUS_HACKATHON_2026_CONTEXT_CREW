import { useCallback, useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { apiClient } from '@/api/client'
import { PageHeader } from '@/shared/components/PageHeader'
import { SectionCard } from '@/shared/components/SectionCard'
import { StatusPill } from '@/shared/components/StatusPill'
import { AIBadge } from '@/shared/components/AIBadge'
import { LoadingSpinner } from '@/shared/components/LoadingSpinner'
import { cn } from '@/shared/utils/cn'

/* ── Types ─────────────────────────────────────────────────────────────── */

interface HardCheck {
  rule_code: string
  passed: boolean
  detail: string
}

interface SoftFlag {
  flag: string
  severity: 'high' | 'medium' | 'low'
}

interface ReportData {
  id: string
  application_id: string
  reference_number: string
  programme_name: string
  applicant_name: string
  status: string
  hard_checks: HardCheck[]
  soft_flags: SoftFlag[]
  overall_result: string
  ai_thematic_score: number | null
  ai_narrative_score: number | null
  officer_decision: string | null
  officer_notes: string | null
  created_at: string
  decided_at: string | null
}

/* ── Score bar ─────────────────────────────────────────────────────────── */

function ScoreBar({ label, score }: { label: string; score: number }) {
  const pct = Math.min(100, Math.max(0, score))
  const color =
    pct >= 80 ? 'bg-moss' : pct >= 60 ? 'bg-amber' : 'bg-rust'

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="font-body text-sm text-bark">{label}</span>
        <span className="font-mono text-sm font-semibold text-soil">
          {score}/100
        </span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-sand/20">
        <div
          className={cn('h-full rounded-full transition-all', color)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

/* ── Severity icon ─────────────────────────────────────────────────────── */

function SeverityIcon({ severity }: { severity: string }) {
  const color =
    severity === 'high'
      ? 'text-rust'
      : severity === 'medium'
        ? 'text-amber'
        : 'text-sand'

  return (
    <svg className={cn('h-4 w-4 flex-shrink-0', color)} viewBox="0 0 20 20" fill="currentColor">
      <path
        fillRule="evenodd"
        d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
        clipRule="evenodd"
      />
    </svg>
  )
}

/* ── Component ─────────────────────────────────────────────────────────── */

export function ScreeningReport() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [report, setReport] = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(true)
  const [deciding, setDeciding] = useState(false)
  const [decisionType, setDecisionType] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [question, setQuestion] = useState('')

  const fetchReport = useCallback(async () => {
    if (!id) return
    setLoading(true)
    try {
      const res = await apiClient.get(`/v1/screening/${id}`)
      setReport(res.data)
    } catch {
      /* empty */
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    fetchReport()
  }, [fetchReport])

  /* ── Submit decision ─────────────────────────────────────────────── */
  async function submitDecision() {
    if (!id || !decisionType) return
    setDeciding(true)
    try {
      const body: Record<string, string> = { decision: decisionType }
      if (decisionType === 'ineligible') body.reason = reason
      if (decisionType === 'clarification') body.clarification_question = question

      const res = await apiClient.post(`/v1/screening/${id}/decide`, body)
      setReport(res.data)
      setDecisionType(null)
      setReason('')
      setQuestion('')
    } catch {
      /* empty */
    } finally {
      setDeciding(false)
    }
  }

  /* ── Loading / not found ─────────────────────────────────────────── */
  if (loading) {
    return (
      <div className="flex h-60 items-center justify-center">
        <LoadingSpinner label="Loading screening report..." />
      </div>
    )
  }

  if (!report) {
    return (
      <div className="py-20 text-center">
        <p className="font-heading text-lg text-bark">
          Screening report not found
        </p>
        <p className="mt-2 font-body text-sm text-sand">
          The AI screening may still be in progress. Check back shortly.
        </p>
        <button
          onClick={() => navigate('/staff/applications')}
          className="mt-4 font-body text-sm text-clay hover:underline"
        >
          Back to Queue
        </button>
      </div>
    )
  }

  const hardPassed = report.hard_checks.filter((c) => c.passed).length
  const hardTotal = report.hard_checks.length
  const allHardPassed = hardPassed === hardTotal
  const alreadyDecided = report.officer_decision != null

  /* ── Render ──────────────────────────────────────────────────────── */
  return (
    <div>
      <PageHeader
        title={`Screening — ${report.reference_number}`}
        breadcrumbs={[
          { label: 'Screening Queue', href: '/staff/applications' },
          { label: report.reference_number },
        ]}
        action={<StatusPill status={report.overall_result} />}
      />

      {/* Meta bar */}
      <div className="mb-6 flex flex-wrap gap-4 rounded-lg border border-sand bg-parchment px-5 py-3">
        <div>
          <span className="font-body text-xs text-sand">Programme</span>
          <p className="font-body text-sm font-medium text-bark">
            {report.programme_name}
          </p>
        </div>
        <div>
          <span className="font-body text-xs text-sand">Applicant</span>
          <p className="font-body text-sm font-medium text-bark">
            {report.applicant_name}
          </p>
        </div>
        <div>
          <span className="font-body text-xs text-sand">App Status</span>
          <p><StatusPill status={report.status} /></p>
        </div>
        {alreadyDecided && (
          <div>
            <span className="font-body text-xs text-sand">Officer Decision</span>
            <p><StatusPill status={report.officer_decision!} /></p>
          </div>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left column — checks */}
        <div className="space-y-6 lg:col-span-2">
          {/* Hard checks */}
          <SectionCard
            title={`Hard Eligibility Checks (${hardPassed}/${hardTotal})`}
          >
            <div className="overflow-x-auto">
              <table className="w-full text-left font-body text-sm">
                <thead>
                  <tr className="border-b border-straw text-xs text-sand">
                    <th className="pb-2 pr-3 font-medium">Rule</th>
                    <th className="pb-2 pr-3 font-medium">Result</th>
                    <th className="pb-2 font-medium">Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {report.hard_checks.map((check) => (
                    <tr key={check.rule_code} className="border-b border-straw/40">
                      <td className="py-2 pr-3 font-mono text-xs text-bark">
                        {check.rule_code}
                      </td>
                      <td className="py-2 pr-3">
                        <span
                          className={cn(
                            'inline-flex items-center rounded-pill px-2 py-0.5 font-mono text-xs font-semibold',
                            check.passed
                              ? 'bg-moss/15 text-moss'
                              : 'bg-rust/15 text-rust',
                          )}
                        >
                          {check.passed ? 'PASS' : 'FAIL'}
                        </span>
                      </td>
                      <td className="py-2 text-bark">{check.detail}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {!allHardPassed && (
              <div className="mt-3 rounded-md bg-rust/10 px-3 py-2">
                <p className="font-body text-xs font-medium text-rust">
                  {hardTotal - hardPassed} hard check(s) failed — application
                  does not meet minimum eligibility criteria.
                </p>
              </div>
            )}
          </SectionCard>

          {/* Soft checks / AI analysis */}
          <SectionCard title="AI Quality Analysis">
            <div className="mb-3 flex items-center gap-2">
              <AIBadge label="AI Screening" />
              <span className="font-body text-xs text-sand">
                Powered by Claude
              </span>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <ScoreBar
                label="Thematic Alignment"
                score={report.ai_thematic_score ?? 0}
              />
              <ScoreBar
                label="Narrative Coherence"
                score={report.ai_narrative_score ?? 0}
              />
            </div>
          </SectionCard>

          {/* Soft flags */}
          {report.soft_flags.length > 0 && (
            <SectionCard title="Soft Flags">
              <ul className="space-y-2">
                {report.soft_flags.map((flag, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2 rounded-md bg-cream px-3 py-2"
                  >
                    <SeverityIcon severity={flag.severity} />
                    <div className="min-w-0 flex-1">
                      <p className="font-body text-sm text-bark">
                        {flag.flag}
                      </p>
                      <p className="font-mono text-[10px] uppercase text-sand">
                        {flag.severity}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </SectionCard>
          )}
        </div>

        {/* Right column — decision panel */}
        <div className="space-y-6">
          <SectionCard title="Officer Decision">
            {alreadyDecided ? (
              <div className="space-y-3">
                <div className="rounded-md bg-parchment px-3 py-2">
                  <p className="font-body text-xs text-sand">Decision</p>
                  <p className="mt-0.5">
                    <StatusPill status={report.officer_decision!} />
                  </p>
                </div>
                {report.officer_notes && (
                  <div className="rounded-md bg-parchment px-3 py-2">
                    <p className="font-body text-xs text-sand">Notes</p>
                    <p className="mt-0.5 font-body text-sm text-bark whitespace-pre-wrap">
                      {report.officer_notes}
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <p className="font-body text-xs text-sand">
                  Review the checks above and record your decision.
                </p>

                {/* Decision buttons */}
                <div className="flex flex-col gap-2">
                  <button
                    onClick={() => setDecisionType('eligible')}
                    disabled={deciding}
                    className={cn(
                      'rounded-lg border px-4 py-2.5 font-heading text-sm font-semibold transition-colors',
                      decisionType === 'eligible'
                        ? 'border-moss bg-moss text-cream'
                        : 'border-moss/40 bg-moss/10 text-moss hover:bg-moss/20',
                    )}
                  >
                    Confirm Eligible
                  </button>

                  <button
                    onClick={() => setDecisionType('ineligible')}
                    disabled={deciding}
                    className={cn(
                      'rounded-lg border px-4 py-2.5 font-heading text-sm font-semibold transition-colors',
                      decisionType === 'ineligible'
                        ? 'border-rust bg-rust text-cream'
                        : 'border-rust/40 bg-rust/10 text-rust hover:bg-rust/20',
                    )}
                  >
                    Mark Ineligible
                  </button>

                  <button
                    onClick={() => setDecisionType('clarification')}
                    disabled={deciding}
                    className={cn(
                      'rounded-lg border px-4 py-2.5 font-heading text-sm font-semibold transition-colors',
                      decisionType === 'clarification'
                        ? 'border-water bg-water text-cream'
                        : 'border-water/40 bg-water/10 text-water hover:bg-water/20',
                    )}
                  >
                    Request Clarification
                  </button>
                </div>

                {/* Reason textarea (ineligible) */}
                {decisionType === 'ineligible' && (
                  <div className="space-y-1">
                    <label className="font-body text-xs font-medium text-bark">
                      Reason for ineligibility *
                    </label>
                    <textarea
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      rows={3}
                      className="w-full rounded-md border border-sand bg-cream px-3 py-2 font-body text-sm text-soil placeholder:text-sand/60 focus:border-clay focus:outline-none focus:ring-[3px] focus:ring-clay/30"
                      placeholder="Explain why this application is ineligible..."
                    />
                  </div>
                )}

                {/* Clarification question */}
                {decisionType === 'clarification' && (
                  <div className="space-y-1">
                    <label className="font-body text-xs font-medium text-bark">
                      Clarification question *
                    </label>
                    <textarea
                      value={question}
                      onChange={(e) => setQuestion(e.target.value)}
                      rows={3}
                      className="w-full rounded-md border border-sand bg-cream px-3 py-2 font-body text-sm text-soil placeholder:text-sand/60 focus:border-clay focus:outline-none focus:ring-[3px] focus:ring-clay/30"
                      placeholder="What information do you need from the applicant?"
                    />
                  </div>
                )}

                {/* Submit button */}
                {decisionType && (
                  <button
                    onClick={submitDecision}
                    disabled={
                      deciding ||
                      (decisionType === 'ineligible' && !reason.trim()) ||
                      (decisionType === 'clarification' && !question.trim())
                    }
                    className="w-full rounded-lg bg-soil px-4 py-2.5 font-heading text-sm font-semibold text-cream transition-colors hover:bg-bark disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {deciding ? 'Saving...' : 'Submit Decision'}
                  </button>
                )}
              </div>
            )}
          </SectionCard>

          {/* Summary card */}
          <SectionCard title="Summary">
            <dl className="space-y-2">
              <div>
                <dt className="font-body text-xs text-sand">Overall Result</dt>
                <dd className="mt-0.5">
                  <StatusPill status={report.overall_result} />
                </dd>
              </div>
              <div>
                <dt className="font-body text-xs text-sand">Hard Checks</dt>
                <dd className="font-mono text-sm text-bark">
                  {hardPassed}/{hardTotal} passed
                </dd>
              </div>
              <div>
                <dt className="font-body text-xs text-sand">Soft Flags</dt>
                <dd className="font-mono text-sm text-bark">
                  {report.soft_flags.length} flag(s)
                </dd>
              </div>
            </dl>
          </SectionCard>
        </div>
      </div>
    </div>
  )
}
