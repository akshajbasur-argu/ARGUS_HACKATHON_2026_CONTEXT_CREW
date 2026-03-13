import { useState, useCallback, useMemo, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { PageHeader } from '@/shared/components/PageHeader'
import { SectionCard } from '@/shared/components/SectionCard'
import { FormTextarea, FormInput, FormSelect } from '@/shared/components/FormField'
import { cn } from '@/shared/utils/cn'
import { formatINR } from '@/shared/utils/formatCurrency'
import { apiClient } from '@/api/client'

interface ExpenditureRow {
  id: string
  date: string
  payee: string
  amount: string
  category: string
  description: string
}

const CATEGORIES = [
  { value: 'personnel', label: 'Personnel / Salaries' },
  { value: 'travel', label: 'Travel & Transport' },
  { value: 'equipment', label: 'Equipment & Supplies' },
  { value: 'services', label: 'Professional Services' },
  { value: 'admin', label: 'Administrative Costs' },
  { value: 'other', label: 'Other' },
]

const REPORT_TYPES = [
  { value: 'progress', label: 'Progress Report' },
  { value: 'final', label: 'Final Report' },
]

let rowId = 1
function makeRow(): ExpenditureRow {
  return { id: `row-${rowId++}`, date: '', payee: '', amount: '', category: 'personnel', description: '' }
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}

export function ReportSubmission() {
  const { id: appId } = useParams<{ id: string }>()

  // Report fields
  const [reportType, setReportType] = useState('progress')
  const [periodLabel, setPeriodLabel] = useState('')
  const [activitiesSummary, setActivitiesSummary] = useState('')
  const [outcomeProgress, setOutcomeProgress] = useState('')
  const [challenges, setChallenges] = useState('')
  const [nextSteps, setNextSteps] = useState('')
  const [financialSummary, setFinancialSummary] = useState('')

  // Expenditure table
  const [expenditures, setExpenditures] = useState<ExpenditureRow[]>([makeRow()])

  // Variance explanations
  const [varianceExplanation, setVarianceExplanation] = useState('')

  // File attachments (simulated)
  const [attachments, setAttachments] = useState<string[]>([])

  // Auditor certificate
  const [auditorCertAttached, setAuditorCertAttached] = useState(false)
  const [awardAmount, setAwardAmount] = useState<number>(0)
  const auditorCertRequired = reportType === 'final' && awardAmount > 1000000
  const auditorCertOptional = reportType === 'final' && awardAmount <= 1000000

  // Fetch grant award amount for auditor cert check
  useEffect(() => {
    if (!appId) return
    apiClient.get(`/v1/finance/disbursements`)
      .then((res) => {
        const disbursements = res.data as { application_id: string; amount_inr: string }[]
        const total = disbursements
          .filter((d) => d.application_id === appId)
          .reduce((sum, d) => sum + parseFloat(d.amount_inr || '0'), 0)
        setAwardAmount(total)
      })
      .catch(() => { /* non-critical */ })
  }, [appId])

  // Submission state
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')

  // Word counts
  const activityWords = wordCount(activitiesSummary)
  const outcomeWords = wordCount(outcomeProgress)
  const challengeWords = wordCount(challenges)
  const nextStepWords = wordCount(nextSteps)
  const financialWords = wordCount(financialSummary)

  // Minimum word counts
  const minActivity = 100
  const minOutcome = 50
  const minChallenge = 50
  const minNextStep = 50
  const minFinancial = 50

  const meetsMinimums = activityWords >= minActivity &&
    outcomeWords >= minOutcome &&
    challengeWords >= minChallenge &&
    nextStepWords >= minNextStep &&
    financialWords >= minFinancial &&
    periodLabel.trim().length > 0 &&
    (!auditorCertRequired || auditorCertAttached)

  // Expenditure total
  const expenditureTotal = useMemo(() => {
    return expenditures.reduce((sum, r) => {
      const v = parseFloat(r.amount)
      return sum + (isNaN(v) ? 0 : v)
    }, 0)
  }, [expenditures])

  // Expenditure row management
  const addRow = useCallback(() => {
    setExpenditures((prev) => [...prev, makeRow()])
  }, [])

  const removeRow = useCallback((id: string) => {
    setExpenditures((prev) => prev.filter((r) => r.id !== id))
  }, [])

  const updateRow = useCallback((id: string, field: keyof ExpenditureRow, value: string) => {
    setExpenditures((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [field]: value } : r))
    )
  }, [])

  // File upload simulation
  const handleFileAdd = useCallback(() => {
    if (attachments.length >= 10) return
    setAttachments((prev) => [...prev, `attachment_${prev.length + 1}.pdf`])
  }, [attachments])

  const removeFile = useCallback((idx: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== idx))
  }, [])

  // Submit
  const handleSubmit = useCallback(async () => {
    if (!meetsMinimums) return
    setSubmitting(true)
    setError('')

    try {
      await apiClient.post(`/v1/compliance/grantee/reports/${appId}`, {
        report_type: reportType,
        period_label: periodLabel.trim(),
        form_data: {
          activities_summary: activitiesSummary.trim(),
          outcome_progress: outcomeProgress.trim(),
          challenges: challenges.trim(),
          next_steps: nextSteps.trim(),
          financial_summary: financialSummary.trim(),
          expenditures: expenditures.filter((r) => r.payee.trim()).map((r) => ({
            date: r.date,
            payee: r.payee,
            amount_inr: parseFloat(r.amount) || 0,
            category: r.category,
            description: r.description,
          })),
          variance_explanation: varianceExplanation.trim(),
          attachments: [
            ...attachments,
            ...(auditorCertAttached ? ['auditor_certificate.pdf'] : []),
          ],
        },
      })
      setSubmitted(true)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(msg || 'Failed to submit report.')
    } finally {
      setSubmitting(false)
    }
  }, [appId, reportType, periodLabel, activitiesSummary, outcomeProgress, challenges, nextSteps, financialSummary, expenditures, varianceExplanation, attachments, auditorCertAttached, meetsMinimums])

  if (submitted) {
    return (
      <div className="mx-auto max-w-4xl">
        <PageHeader title="Report Submitted" breadcrumbs={[{ label: 'Applications', href: '/applications' }, { label: 'Report' }]} />
        <SectionCard title="Success">
          <div className="rounded-md border border-moss/30 bg-moss/10 px-4 py-6 text-center">
            <p className="font-heading text-lg font-semibold text-moss">Report submitted successfully</p>
            <p className="mt-2 font-body text-sm text-bark">
              Your report has been submitted for review. AI compliance analysis will be generated shortly.
            </p>
          </div>
        </SectionCard>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Submit Progress Report"
        breadcrumbs={[
          { label: 'Applications', href: '/applications' },
          { label: 'Report Submission' },
        ]}
      />

      {/* Report type and period */}
      <SectionCard title="Report Details">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormSelect
            label="Report Type"
            required
            options={REPORT_TYPES}
            value={reportType}
            onChange={(e) => setReportType((e.target as HTMLSelectElement).value)}
          />
          <FormInput
            label="Reporting Period"
            required
            value={periodLabel}
            onChange={(e) => setPeriodLabel(e.target.value)}
            placeholder="e.g. April 2026 - September 2026"
          />
        </div>
      </SectionCard>

      {/* Narrative sections with word counts */}
      <div className="mt-6">
        <SectionCard title="Narrative Report">
          <div className="space-y-5">
            <WordCountTextarea
              label="Activities Summary"
              value={activitiesSummary}
              onChange={setActivitiesSummary}
              min={minActivity}
              count={activityWords}
              placeholder="Describe activities undertaken during this reporting period..."
            />
            <WordCountTextarea
              label="Outcome Progress"
              value={outcomeProgress}
              onChange={setOutcomeProgress}
              min={minOutcome}
              count={outcomeWords}
              placeholder="Report on progress towards stated outcomes and indicators..."
            />
            <WordCountTextarea
              label="Challenges & Risks"
              value={challenges}
              onChange={setChallenges}
              min={minChallenge}
              count={challengeWords}
              placeholder="Describe any challenges, risks, or deviations from plan..."
            />
            <WordCountTextarea
              label="Next Steps"
              value={nextSteps}
              onChange={setNextSteps}
              min={minNextStep}
              count={nextStepWords}
              placeholder="Planned activities for the next reporting period..."
            />
            <WordCountTextarea
              label="Financial Summary"
              value={financialSummary}
              onChange={setFinancialSummary}
              min={minFinancial}
              count={financialWords}
              placeholder="Summarise financial utilisation and any budget reallocations..."
            />
          </div>
        </SectionCard>
      </div>

      {/* Expenditure table */}
      <div className="mt-6">
        <SectionCard title="Expenditure This Period">
          <div className="space-y-3">
            {expenditures.map((row, idx) => (
              <div key={row.id} className="rounded-md border border-sand bg-cream p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-mono text-xs text-bark">#{idx + 1}</span>
                  {expenditures.length > 1 && (
                    <button type="button" onClick={() => removeRow(row.id)} className="text-xs text-rust hover:underline">
                      Remove
                    </button>
                  )}
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                  <FormInput label="Date" type="date" required value={row.date} onChange={(e) => updateRow(row.id, 'date', e.target.value)} />
                  <FormInput label="Payee" required value={row.payee} onChange={(e) => updateRow(row.id, 'payee', e.target.value)} placeholder="Payee name" />
                  <FormInput label="Amount (INR)" type="number" min="0" step="0.01" required value={row.amount} onChange={(e) => updateRow(row.id, 'amount', e.target.value)} placeholder="0.00" />
                  <FormSelect label="Category" required options={CATEGORIES} value={row.category} onChange={(e) => updateRow(row.id, 'category', (e.target as HTMLSelectElement).value)} />
                  <FormInput label="Description" value={row.description} onChange={(e) => updateRow(row.id, 'description', e.target.value)} placeholder="Brief description" />
                </div>
              </div>
            ))}

            <button type="button" onClick={addRow} className={cn(
              'w-full rounded-md border-2 border-dashed border-sand py-2.5',
              'font-body text-sm text-bark transition-colors hover:border-clay hover:text-clay',
            )}>
              + Add Expenditure Row
            </button>

            <div className="flex items-center justify-between rounded-md bg-parchment border border-sand px-4 py-3">
              <span className="font-heading text-sm font-semibold text-bark">Period Total</span>
              <span className="font-mono text-sm font-bold text-moss">{formatINR(expenditureTotal)}</span>
            </div>
          </div>
        </SectionCard>
      </div>

      {/* Variance explanation */}
      <div className="mt-6">
        <SectionCard title="Variance Explanation">
          <FormTextarea
            label="Explain any budget deviations > 10%"
            value={varianceExplanation}
            onChange={(e) => setVarianceExplanation(e.target.value)}
            placeholder="If any budget line item deviates more than 10% from the approved plan, provide an explanation here..."
            hint="Required if any category shows more than 10% deviation from approved budget."
            rows={3}
          />
        </SectionCard>
      </div>

      {/* File attachments */}
      <div className="mt-6">
        <SectionCard title="Attachments">
          <div className="space-y-3">
            {attachments.map((name, idx) => (
              <div key={idx} className="flex items-center justify-between rounded-md border border-sand bg-cream px-3 py-2">
                <span className="font-body text-sm text-bark">{name}</span>
                <button type="button" onClick={() => removeFile(idx)} className="text-xs text-rust hover:underline">
                  Remove
                </button>
              </div>
            ))}

            {attachments.length < 10 && (
              <button type="button" onClick={handleFileAdd} className={cn(
                'rounded-md border border-sand bg-cream px-4 py-2',
                'font-body text-sm text-bark transition-colors hover:bg-parchment',
              )}>
                + Add Attachment (max 10)
              </button>
            )}
            <p className="font-body text-xs text-sand">{attachments.length}/10 attachments</p>
          </div>
        </SectionCard>
      </div>

      {/* Auditor Certificate (conditional for final reports) */}
      {reportType === 'final' && (
        <div className="mt-6">
          <SectionCard title={
            auditorCertRequired
              ? 'Auditor Certificate (required for grants > INR 10 lakh)'
              : 'Auditor Certificate'
          }>
            {auditorCertRequired ? (
              <div className="space-y-3">
                <div className="rounded-md border border-amber/30 bg-amber/10 px-4 py-3">
                  <p className="font-body text-sm text-bark">
                    <span className="text-rust font-semibold">* Required</span> — Your grant award exceeds INR 10,00,000.
                    A signed Auditor Certificate must be attached with the final report.
                  </p>
                </div>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={auditorCertAttached}
                    onChange={(e) => setAuditorCertAttached(e.target.checked)}
                    className="h-4 w-4 rounded border-sand text-clay focus:ring-clay"
                  />
                  <span className="font-body text-sm text-bark">
                    I have attached the signed Auditor Certificate
                  </span>
                </label>
                {!auditorCertAttached && (
                  <p className="font-body text-xs text-rust">
                    You must attach an auditor certificate to submit this final report.
                  </p>
                )}
              </div>
            ) : auditorCertOptional ? (
              <div className="rounded-md border border-moss/30 bg-moss/10 px-4 py-3">
                <p className="font-body text-sm text-bark">
                  Not required for this grant amount ({formatINR(awardAmount)}).
                  You may still attach one if available.
                </p>
                <label className="mt-2 flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={auditorCertAttached}
                    onChange={(e) => setAuditorCertAttached(e.target.checked)}
                    className="h-4 w-4 rounded border-sand text-clay focus:ring-clay"
                  />
                  <span className="font-body text-sm text-bark">
                    Attach Auditor Certificate (optional)
                  </span>
                </label>
              </div>
            ) : null}
          </SectionCard>
        </div>
      )}

      {/* Submit */}
      <div className="mt-6">
        {error && (
          <div className="mb-4 rounded-md border border-rust/30 bg-rust/10 px-4 py-3">
            <p className="font-body text-sm text-rust">{error}</p>
          </div>
        )}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={!meetsMinimums || submitting}
          className={cn(
            'w-full rounded-md px-5 py-3 font-body text-sm font-medium transition-colors',
            meetsMinimums
              ? 'bg-clay text-cream hover:bg-bark'
              : 'bg-sand/30 text-sand cursor-not-allowed',
            'disabled:cursor-not-allowed disabled:opacity-50',
          )}
        >
          {submitting ? 'Submitting...' : 'Submit Report'}
        </button>

        {!meetsMinimums && (
          <p className="mt-2 text-center font-body text-xs text-sand">
            Please meet all minimum word counts and fill in the reporting period to enable submission.
          </p>
        )}
      </div>
    </div>
  )
}

// ── Helper component ────────────────────────────────────────────────────────

function WordCountTextarea({
  label,
  value,
  onChange,
  min,
  count,
  placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  min: number
  count: number
  placeholder: string
}) {
  const met = count >= min
  return (
    <div>
      <FormTextarea
        label={label}
        required
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={5}
      />
      <div className="mt-1 flex items-center gap-2">
        <span className={cn(
          'font-mono text-xs',
          met ? 'text-moss' : 'text-amber',
        )}>
          {count}/{min} words {met ? '' : '(minimum not met)'}
        </span>
      </div>
    </div>
  )
}
