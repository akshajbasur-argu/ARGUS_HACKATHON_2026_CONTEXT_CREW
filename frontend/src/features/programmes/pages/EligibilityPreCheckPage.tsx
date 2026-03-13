import { useState, useEffect, type FormEvent } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { FormSelect, FormInput } from '@/shared/components/FormField'
import { PageHeader } from '@/shared/components/PageHeader'
import { SectionCard } from '@/shared/components/SectionCard'
import { LoadingSpinner } from '@/shared/components/LoadingSpinner'
import { listProgrammes, precheckEligibility } from '../api'
import type { ProgrammeListItem, PrecheckResultItem } from '../types'
import { cn } from '@/shared/utils/cn'

// ── Constants ─────────────────────────────────────────────────────────────────

const ORG_TYPE_OPTIONS = [
  { value: 'NGO', label: 'NGO (Non-Governmental Organisation)' },
  { value: 'Trust', label: 'Trust' },
  { value: 'Section8', label: 'Section 8 Company' },
  { value: 'EdTech', label: 'EdTech Company' },
  { value: 'University', label: 'University / College' },
  { value: 'Research', label: 'Research Institute' },
  { value: 'FPO', label: 'Farmer Producer Organisation (FPO)' },
  { value: 'Panchayat', label: 'Gram Panchayat / Local Body' },
  { value: 'Company', label: 'Private Limited Company' },
  { value: 'Other', label: 'Other' },
]

// ── Result card ───────────────────────────────────────────────────────────────

function ResultCard({ item }: { item: PrecheckResultItem }) {
  const isEligible = item.result === 'likely_eligible'

  return (
    <div
      className={cn(
        'rounded-lg border-l-4 overflow-hidden',
        isEligible
          ? 'border-l-moss bg-moss/5 border border-moss/20'
          : 'border-l-rust bg-rust/5 border border-rust/20',
      )}
    >
      {/* Header row */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between px-5 py-3 md:px-6">
        <div>
          <span className="font-mono text-xs font-semibold uppercase tracking-wider text-sand">
            {item.programme_code}
          </span>
          <p className="font-heading text-base font-bold text-soil mt-0.5 leading-tight">
            {item.programme_name}
          </p>
        </div>

        <span
          className={cn(
            'self-start sm:self-center shrink-0 inline-flex items-center gap-1.5 rounded-pill px-3 py-1',
            'font-mono text-xs font-semibold uppercase tracking-wide border',
            isEligible
              ? 'bg-moss/15 text-moss border-moss/40'
              : 'bg-rust/15 text-rust border-rust/40',
          )}
        >
          {isEligible ? (
            <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
            </svg>
          ) : (
            <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          )}
          {isEligible ? 'Likely Eligible' : 'Likely Ineligible'}
        </span>
      </div>

      {/* Failed rules */}
      {item.failed_rules.length > 0 && (
        <div className="border-t border-rust/20 px-5 py-3 md:px-6 space-y-2">
          <p className="font-mono text-xs font-semibold uppercase tracking-wide text-rust mb-2">
            Failed Rules
          </p>
          {item.failed_rules.map((rule) => (
            <div key={rule.rule_code} className="flex items-start gap-2">
              <span className="mt-0.5 shrink-0 rounded bg-rust/10 px-1.5 py-0.5 font-mono text-xs text-rust border border-rust/20">
                {rule.rule_code}
              </span>
              <p className="font-body text-sm text-bark leading-relaxed">{rule.reason}</p>
            </div>
          ))}
        </div>
      )}

      {/* Eligible CTA */}
      {isEligible && (
        <div className="border-t border-moss/20 px-5 py-3 md:px-6 flex items-center justify-between">
          <p className="font-body text-xs text-moss">
            Your organisation appears to meet the basic criteria.
          </p>
          <Link
            to={`/programmes/${item.programme_id}`}
            className="ml-4 shrink-0 btn-secondary !py-1 !px-3 !text-xs"
          >
            View Programme →
          </Link>
        </div>
      )}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function EligibilityPreCheckPage() {
  const [searchParams] = useSearchParams()
  const preselectedId = searchParams.get('programme_id') ?? ''

  const [programmes, setProgrammes] = useState<ProgrammeListItem[]>([])
  const [orgType, setOrgType] = useState('')
  const [district, setDistrict] = useState('')
  const [amount, setAmount] = useState('')
  const [programmeId, setProgrammeId] = useState(preselectedId)

  const [submitting, setSubmitting] = useState(false)
  const [results, setResults] = useState<PrecheckResultItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    listProgrammes().then(setProgrammes).catch(() => { })
  }, [])

  function validate(): boolean {
    const errs: Record<string, string> = {}
    if (!orgType) errs.org_type = 'Please select your organisation type.'
    if (!district.trim()) errs.district = 'Please enter the project district.'
    if (!amount || Number(amount) <= 0) errs.amount = 'Please enter a valid funding amount.'
    setFormErrors(errs)
    return Object.keys(errs).length === 0
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!validate()) return

    setSubmitting(true)
    setError(null)
    setResults(null)

    try {
      const data = await precheckEligibility({
        org_type: orgType,
        project_district: district.trim(),
        funding_amount_inr: Number(amount),
        ...(programmeId ? { programme_id: programmeId } : {}),
      })
      setResults(data)
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const programmeOptions = [
    { value: '', label: 'All programmes' },
    ...programmes.map((p) => ({ value: p.id, label: `${p.code} — ${p.name}` })),
  ]

  return (
    <div className="min-h-screen bg-cream px-4 py-8 md:px-8 md:py-12">
      <div className="mx-auto max-w-2xl">
        <PageHeader
          title="Eligibility Pre-Check"
          breadcrumbs={[
            { label: 'Programmes', href: '/' },
            { label: 'Eligibility Check' },
          ]}
        />

        <p className="mb-8 font-body text-base text-bark">
          Answer three quick questions to see which GrantFlow programmes your organisation
          qualifies for. No account needed.
        </p>

        {/* Form */}
        <SectionCard title="Your Details" className="mb-6">
          <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
            <FormSelect
              label="Organisation Type"
              id="org_type"
              required
              value={orgType}
              onChange={(e) => setOrgType((e.target as HTMLSelectElement).value)}
              options={ORG_TYPE_OPTIONS}
              placeholder="Select organisation type…"
              error={formErrors.org_type}
            />

            <FormInput
              label="Project District"
              id="district"
              type="text"
              required
              placeholder="e.g. Araria, Barmer, Koraput"
              value={district}
              onChange={(e) => setDistrict(e.target.value)}
              hint="Enter the district where your project will primarily operate."
              error={formErrors.district}
            />

            <FormInput
              label="Funding Requested (INR)"
              id="amount"
              type="number"
              required
              min={1}
              placeholder="e.g. 750000"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              hint="Enter the total grant amount you intend to request."
              error={formErrors.amount}
            />

            <FormSelect
              label="Check for a specific programme (optional)"
              id="programme_id"
              value={programmeId}
              onChange={(e) => setProgrammeId((e.target as HTMLSelectElement).value)}
              options={programmeOptions}
            />

            <button
              type="submit"
              disabled={submitting}
              className="btn-primary self-start min-w-[160px] justify-center"
            >
              {submitting ? (
                <>
                  <LoadingSpinner size="sm" />
                  Checking…
                </>
              ) : (
                'Check Eligibility →'
              )}
            </button>
          </form>
        </SectionCard>

        {/* Error */}
        {error && (
          <div className="mb-4 rounded-lg border border-rust/30 bg-rust/10 px-5 py-4">
            <p className="font-body text-sm text-rust">{error}</p>
          </div>
        )}

        {/* Results */}
        {results !== null && (
          <div className="animate-slide-up">
            <h2 className="font-heading text-xl font-bold text-soil mb-4">Results</h2>
            {results.length === 0 ? (
              <p className="font-body text-sm text-bark">No programmes matched your query.</p>
            ) : (
              <div className="flex flex-col gap-4">
                {results.map((r) => (
                  <ResultCard key={r.programme_id} item={r} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
