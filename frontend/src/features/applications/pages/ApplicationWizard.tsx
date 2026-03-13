import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { apiClient } from '@/api/client'
import { useAuthStore } from '@/store/authStore'
import { PageHeader } from '@/shared/components/PageHeader'
import { SectionCard } from '@/shared/components/SectionCard'
import { FormInput, FormTextarea, FormSelect } from '@/shared/components/FormField'
import { LoadingSpinner } from '@/shared/components/LoadingSpinner'
import { formatINR } from '@/shared/utils/formatCurrency'
import { cn } from '@/shared/utils/cn'

/* ── Types ─────────────────────────────────────────────────────────────── */

interface FormData {
  /* Organisation (pre-filled) */
  org_name: string
  org_type: string
  org_registration: string
  org_state: string
  /* Project */
  project_title: string
  problem_statement: string
  proposed_solution: string
  expected_outcomes: string
  target_beneficiaries: string
  /* Team */
  team_description: string
  /* Budget */
  budget_total: number
  budget_breakdown: {
    personnel: number
    equipment: number
    travel: number
    overheads: number
    other: number
  }
  duration_months: number
  sustainability_plan: string
  /* Documents */
  attached_docs: string[]
  /* Declaration */
  declaration_accepted: boolean
  [key: string]: unknown
}

interface VaultDoc {
  id: string
  doc_type: string
  filename: string
}

/* ── Steps ─────────────────────────────────────────────────────────────── */

const STEPS = [
  'Organisation',
  'Project',
  'Team',
  'Budget',
  'Documents',
  'Review & Submit',
] as const

/* ── Component ─────────────────────────────────────────────────────────── */

export function ApplicationWizard() {
  const { programmeId } = useParams<{ programmeId: string }>()
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)

  const [step, setStep] = useState(0)
  const [appId, setAppId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [apiError, setApiError] = useState<string | null>(null)
  const [submitErrors, setSubmitErrors] = useState<{ field: string; message: string }[]>([])
  const [vaultDocs, setVaultDocs] = useState<VaultDoc[]>([])

  const [form, setForm] = useState<FormData>({
    org_name: user?.organisation?.legal_name ?? '',
    org_type: user?.organisation?.org_type ?? '',
    org_registration: '',
    org_state: '',
    project_title: '',
    problem_statement: '',
    proposed_solution: '',
    expected_outcomes: '',
    target_beneficiaries: '',
    team_description: '',
    budget_total: 0,
    budget_breakdown: { personnel: 0, equipment: 0, travel: 0, overheads: 0, other: 0 },
    duration_months: 12,
    sustainability_plan: '',
    attached_docs: [],
    declaration_accepted: false,
  })

  const autoSaveRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [showSavedToast, setShowSavedToast] = useState(false)
  const isDirtyRef = useRef(false)
  const formRef = useRef(form)
  formRef.current = form

  /* ── Persist helper ────────────────────────────────────────────── */
  const persistDraft = useCallback(async () => {
    if (!appId) return
    try {
      await apiClient.put(`/v1/applications/${appId}`, { form_data: formRef.current })
      isDirtyRef.current = false
      setShowSavedToast(true)
      setTimeout(() => setShowSavedToast(false), 2000)
    } catch { /* silent */ }
  }, [appId])

  /* ── Create application on mount ─────────────────────────────────── */
  useEffect(() => {
    if (!programmeId) return

    const createApp = async () => {
      setLoading(true)
      try {
        const { data } = await apiClient.post('/v1/applications', {
          programme_id: programmeId,
          form_data: {},
        })
        setAppId(data.id)

        // Load vault docs
        const docsRes = await apiClient.get('/v1/documents/vault')
        setVaultDocs(docsRes.data)
      } catch {
        setApiError('Failed to create application. Please try again.')
      } finally {
        setLoading(false)
      }
    }
    createApp()
  }, [programmeId])

  /* ── Auto-save every 30s (only if dirty) ─────────────────────────── */
  useEffect(() => {
    if (!appId) return

    autoSaveRef.current = setInterval(() => {
      if (isDirtyRef.current) {
        persistDraft()
      }
    }, 30000)

    return () => {
      if (autoSaveRef.current) clearInterval(autoSaveRef.current)
    }
  }, [appId, persistDraft])

  /* ── Field updater ───────────────────────────────────────────────── */
  const setField = useCallback(
    <K extends keyof FormData>(key: K, value: FormData[K]) => {
      isDirtyRef.current = true
      setForm((prev) => ({ ...prev, [key]: value }))
      setErrors((prev) => {
        const next = { ...prev }
        delete next[key as string]
        return next
      })
    },
    [],
  )

  const setBudget = useCallback(
    (key: keyof FormData['budget_breakdown'], value: number) => {
      isDirtyRef.current = true
      setForm((prev) => {
        const bb = { ...prev.budget_breakdown, [key]: value }
        const total = bb.personnel + bb.equipment + bb.travel + bb.overheads + bb.other
        return { ...prev, budget_breakdown: bb, budget_total: total }
      })
    },
    [],
  )

  /* ── Budget computed values ──────────────────────────────────────── */
  const budgetTotal = form.budget_breakdown.personnel + form.budget_breakdown.equipment +
    form.budget_breakdown.travel + form.budget_breakdown.overheads + form.budget_breakdown.other
  const overheadPct = budgetTotal > 0
    ? ((form.budget_breakdown.overheads / budgetTotal) * 100)
    : 0
  const overheadOk = overheadPct <= 15

  /* ── Step validation ─────────────────────────────────────────────── */
  const validateStep = (s: number): boolean => {
    const errs: Record<string, string> = {}

    if (s === 0) {
      if (!form.org_name.trim()) errs.org_name = 'Organisation name is required'
      if (!form.org_type) errs.org_type = 'Organisation type is required'
    }
    if (s === 1) {
      if (!form.project_title.trim()) errs.project_title = 'Project title is required'
      if (!form.problem_statement.trim()) errs.problem_statement = 'Problem statement is required'
      if (!form.proposed_solution.trim()) errs.proposed_solution = 'Proposed solution is required'
      if (!form.expected_outcomes.trim()) errs.expected_outcomes = 'Expected outcomes are required'
      if (!form.target_beneficiaries.trim()) errs.target_beneficiaries = 'Target beneficiaries are required'
    }
    if (s === 2) {
      if (!form.team_description.trim()) errs.team_description = 'Team description is required'
    }
    if (s === 3) {
      if (budgetTotal <= 0) errs.budget_total = 'Budget must be greater than zero'
      if (!overheadOk) errs['budget_breakdown.overheads'] = 'Overhead exceeds 15% limit'
      if (form.duration_months < 1) errs.duration_months = 'Duration must be at least 1 month'
    }
    if (s === 5) {
      if (!form.declaration_accepted) errs.declaration_accepted = 'You must accept the declaration'
    }

    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  /* ── Navigation (save before step change) ────────────────────────── */
  const goNext = () => {
    if (validateStep(step)) {
      if (isDirtyRef.current) persistDraft()
      setStep((s) => Math.min(s + 1, STEPS.length - 1))
    }
  }
  const goBack = () => {
    if (isDirtyRef.current) persistDraft()
    setStep((s) => Math.max(s - 1, 0))
  }

  /* ── Submit ──────────────────────────────────────────────────────── */
  const handleSubmit = async () => {
    if (!validateStep(5) || !appId) return

    // Cancel auto-save interval on submit
    if (autoSaveRef.current) clearInterval(autoSaveRef.current)

    setSubmitting(true)
    setSubmitErrors([])
    setApiError(null)

    try {
      // Save final form data
      await apiClient.put(`/v1/applications/${appId}`, { form_data: form })

      // Submit
      const { data } = await apiClient.post(`/v1/applications/${appId}/submit`)

      if (!data.submitted) {
        setSubmitErrors(data.errors || [])
        return
      }

      navigate(`/applications/${appId}`, {
        state: { justSubmitted: true, refNumber: data.reference_number },
      })
    } catch {
      setApiError('Submission failed. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  /* ── Attach document ─────────────────────────────────────────────── */
  const attachDoc = async (docId: string) => {
    if (!appId) return
    try {
      await apiClient.post(`/v1/applications/${appId}/documents`, {
        document_id: docId,
      })
      setField('attached_docs', [...form.attached_docs, docId])
    } catch {
      setApiError('Failed to attach document')
    }
  }

  /* ── Loading state ───────────────────────────────────────────────── */
  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <LoadingSpinner label="Setting up your application..." />
      </div>
    )
  }

  /* ── Render ──────────────────────────────────────────────────────── */
  return (
    <div>
      <PageHeader
        title="Application Form"
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'New Application' },
        ]}
        action={
          <button
            onClick={() => navigate(`/apply/${programmeId}/chat`)}
            className="btn-secondary text-sm"
          >
            Switch to Chat Mode
          </button>
        }
      />

      {apiError && (
        <div className="mb-4 rounded-lg border border-rust/30 bg-rust/10 px-4 py-3">
          <p className="font-body text-sm text-rust">{apiError}</p>
        </div>
      )}

      {/* ── Stepper ────────────────────────────────────────────────── */}
      <div className="mb-8 flex items-center justify-between overflow-x-auto">
        {STEPS.map((label, i) => (
          <div key={i} className="flex items-center">
            <button
              type="button"
              onClick={() => {
                if (i < step) setStep(i)
              }}
              className={cn(
                'flex items-center gap-2 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-mono font-medium transition-colors',
                i < step
                  ? 'bg-sand/30 text-bark cursor-pointer hover:bg-sand/50'
                  : i === step
                    ? 'bg-clay text-cream'
                    : 'bg-sand/20 text-sand cursor-default',
              )}
            >
              <span
                className={cn(
                  'flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold',
                  i < step
                    ? 'bg-moss text-cream'
                    : i === step
                      ? 'bg-soil text-cream'
                      : 'bg-sand/40 text-sand',
                )}
              >
                {i < step ? '\u2713' : i + 1}
              </span>
              {label}
            </button>
            {i < STEPS.length - 1 && (
              <div className={cn('mx-1 h-px w-4 sm:w-8', i < step ? 'bg-moss' : 'bg-sand/40')} />
            )}
          </div>
        ))}
      </div>

      {/* ── Step Content ───────────────────────────────────────────── */}
      <SectionCard title={STEPS[step]}>
        {/* Step 0: Organisation */}
        {step === 0 && (
          <div className="space-y-4">
            <FormInput
              label="Organisation Name" required
              value={form.org_name}
              onChange={(e) => setField('org_name', e.target.value)}
              error={errors.org_name}
            />
            <div className="grid grid-cols-2 gap-4">
              <FormSelect
                label="Organisation Type" required
                value={form.org_type}
                options={[
                  { value: 'ngo', label: 'NGO' }, { value: 'trust', label: 'Trust' },
                  { value: 'society', label: 'Society' }, { value: 'company', label: 'Company (Sec 8)' },
                  { value: 'government', label: 'Government' }, { value: 'individual', label: 'Individual' },
                ]}
                placeholder="Select type"
                onChange={(e) => setField('org_type', (e.target as HTMLSelectElement).value)}
                error={errors.org_type}
              />
              <FormInput
                label="Registration Number"
                value={form.org_registration}
                onChange={(e) => setField('org_registration', e.target.value)}
              />
            </div>
            <FormInput
              label="State"
              value={form.org_state}
              onChange={(e) => setField('org_state', e.target.value)}
            />
          </div>
        )}

        {/* Step 1: Project */}
        {step === 1 && (
          <div className="space-y-4">
            <FormInput
              label="Project Title" required
              value={form.project_title}
              onChange={(e) => setField('project_title', e.target.value)}
              error={errors.project_title}
              placeholder="Clear, concise title (max 150 chars)"
              maxLength={150}
            />
            <FormTextarea
              label="Problem Statement" required
              value={form.problem_statement}
              onChange={(e) => setField('problem_statement', e.target.value)}
              error={errors.problem_statement}
              placeholder="Describe the problem your project addresses (200-500 words)"
            />
            <FormTextarea
              label="Proposed Solution" required
              value={form.proposed_solution}
              onChange={(e) => setField('proposed_solution', e.target.value)}
              error={errors.proposed_solution}
              placeholder="Describe your approach to solving the problem"
            />
            <FormTextarea
              label="Expected Outcomes" required
              value={form.expected_outcomes}
              onChange={(e) => setField('expected_outcomes', e.target.value)}
              error={errors.expected_outcomes}
              placeholder="List 3-5 measurable outcomes with indicators"
            />
            <FormTextarea
              label="Target Beneficiaries" required
              value={form.target_beneficiaries}
              onChange={(e) => setField('target_beneficiaries', e.target.value)}
              error={errors.target_beneficiaries}
              placeholder="Who will benefit? Numbers, demographics, location"
            />
          </div>
        )}

        {/* Step 2: Team */}
        {step === 2 && (
          <div className="space-y-4">
            <FormTextarea
              label="Team Description" required
              value={form.team_description}
              onChange={(e) => setField('team_description', e.target.value)}
              error={errors.team_description}
              placeholder="Key team members, their roles, and relevant experience"
            />
            <FormTextarea
              label="Sustainability Plan"
              value={form.sustainability_plan}
              onChange={(e) => setField('sustainability_plan', e.target.value)}
              placeholder="How will outcomes be sustained after the grant period?"
            />
          </div>
        )}

        {/* Step 3: Budget */}
        {step === 3 && (
          <div className="space-y-4">
            <p className="font-body text-sm text-bark">
              Enter your budget line items below. The total will be calculated automatically.
            </p>

            <div className="grid grid-cols-2 gap-4">
              {(
                ['personnel', 'equipment', 'travel', 'overheads', 'other'] as const
              ).map((key) => (
                <FormInput
                  key={key}
                  label={key.charAt(0).toUpperCase() + key.slice(1) + ' (INR)'}
                  type="number"
                  value={form.budget_breakdown[key] || ''}
                  onChange={(e) => setBudget(key, Number(e.target.value) || 0)}
                  error={errors[`budget_breakdown.${key}`]}
                />
              ))}
              <FormInput
                label="Duration (months)"
                type="number"
                required
                value={form.duration_months || ''}
                onChange={(e) => setField('duration_months', Number(e.target.value) || 0)}
                error={errors.duration_months}
              />
            </div>

            {/* Budget summary */}
            <div className="rounded-lg border border-sand bg-cream px-4 py-3">
              <div className="flex items-center justify-between">
                <span className="font-body text-sm font-medium text-bark">
                  Total Budget
                </span>
                <span className="font-mono text-lg font-bold text-soil">
                  {formatINR(budgetTotal)}
                </span>
              </div>
              <div className="mt-1 flex items-center justify-between">
                <span className="font-body text-xs text-sand">
                  Overhead percentage
                </span>
                <span
                  className={cn(
                    'font-mono text-sm font-bold',
                    overheadOk ? 'text-moss' : 'text-rust',
                  )}
                >
                  {overheadPct.toFixed(1)}%
                  {!overheadOk && ' (exceeds 15% limit)'}
                </span>
              </div>
            </div>

            {errors.budget_total && (
              <p className="font-body text-xs text-rust">{errors.budget_total}</p>
            )}
          </div>
        )}

        {/* Step 4: Documents */}
        {step === 4 && (
          <div className="space-y-4">
            <p className="font-body text-sm text-bark">
              Attach documents from your vault. Required documents vary by programme.
            </p>

            {vaultDocs.length === 0 ? (
              <div className="rounded-lg border-2 border-dashed border-sand bg-parchment/50 p-8 text-center">
                <p className="font-body text-sm text-sand">
                  No documents in your vault.{' '}
                  <a href="/documents" className="text-clay hover:underline">
                    Upload documents first
                  </a>
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {vaultDocs.map((doc) => {
                  const attached = form.attached_docs.includes(doc.id)
                  return (
                    <div
                      key={doc.id}
                      className={cn(
                        'flex items-center justify-between rounded-lg border px-4 py-3',
                        attached
                          ? 'border-moss/40 bg-moss/5'
                          : 'border-sand bg-cream',
                      )}
                    >
                      <div>
                        <p className="font-body text-sm font-medium text-soil">
                          {doc.filename}
                        </p>
                        <p className="font-mono text-xs text-sand">
                          {doc.doc_type.replace(/_/g, ' ')}
                        </p>
                      </div>
                      {attached ? (
                        <span className="rounded-full bg-moss/10 px-3 py-1 font-mono text-xs text-moss">
                          Attached
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => attachDoc(doc.id)}
                          className="btn-secondary text-xs px-3 py-1"
                        >
                          Attach
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Step 5: Review & Submit */}
        {step === 5 && (
          <div className="space-y-6">
            {/* Summary sections */}
            {[
              { title: 'Organisation', items: [
                ['Name', form.org_name], ['Type', form.org_type],
                ['Registration', form.org_registration || '—'], ['State', form.org_state || '—'],
              ]},
              { title: 'Project', items: [
                ['Title', form.project_title],
                ['Problem', form.problem_statement.slice(0, 200) + (form.problem_statement.length > 200 ? '...' : '')],
                ['Solution', form.proposed_solution.slice(0, 200) + (form.proposed_solution.length > 200 ? '...' : '')],
              ]},
              { title: 'Budget', items: [
                ['Total', formatINR(budgetTotal)],
                ['Duration', `${form.duration_months} months`],
                ['Overhead', `${overheadPct.toFixed(1)}%`],
              ]},
              { title: 'Documents', items: [
                ['Attached', `${form.attached_docs.length} document(s)`],
              ]},
            ].map((section) => (
              <div key={section.title} className="rounded-lg border border-sand bg-cream px-4 py-3">
                <h4 className="font-heading text-xs font-semibold uppercase tracking-wider text-bark mb-2">
                  {section.title}
                </h4>
                <dl className="space-y-1">
                  {section.items.map(([label, value]) => (
                    <div key={label} className="flex gap-2">
                      <dt className="font-body text-xs text-sand w-24 shrink-0">{label}</dt>
                      <dd className="font-body text-xs text-soil">{value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}

            {/* Submit errors */}
            {submitErrors.length > 0 && (
              <div className="rounded-lg border border-rust/30 bg-rust/10 px-4 py-3">
                <p className="font-heading text-xs font-semibold text-rust mb-2">
                  Please fix the following issues:
                </p>
                <ul className="list-disc pl-5 space-y-1">
                  {submitErrors.map((e, i) => (
                    <li key={i} className="font-body text-xs text-rust">
                      <span className="font-medium">{e.field}</span>: {e.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Declaration */}
            <label className="flex items-start gap-3 rounded-lg border border-sand bg-cream px-4 py-3 cursor-pointer">
              <input
                type="checkbox"
                checked={form.declaration_accepted}
                onChange={(e) => setField('declaration_accepted', e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-sand text-clay focus:ring-clay/30"
              />
              <span className="font-body text-xs text-bark leading-relaxed">
                I declare that all information provided is accurate and complete to the best of my knowledge.
                I understand that submitting false information may result in disqualification and recovery of funds.
              </span>
            </label>
            {errors.declaration_accepted && (
              <p className="font-body text-xs text-rust">{errors.declaration_accepted}</p>
            )}
          </div>
        )}
      </SectionCard>

      {/* ── Navigation buttons ─────────────────────────────────────── */}
      <div className="mt-6 flex items-center justify-between">
        <button
          type="button"
          onClick={goBack}
          disabled={step === 0}
          className="btn-secondary disabled:opacity-40"
        >
          Back
        </button>

        <div className="flex items-center gap-3">
          <span className="font-mono text-xs text-sand">
            Step {step + 1} of {STEPS.length}
          </span>

          {step < STEPS.length - 1 ? (
            <button type="button" onClick={goNext} className="btn-primary">
              Next
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="btn-primary"
            >
              {submitting ? 'Submitting...' : 'Submit Application'}
            </button>
          )}
        </div>
      </div>

      {/* ── Auto-save toast ──────────────────────────────────────────── */}
      {showSavedToast && (
        <div className="fixed bottom-6 right-6 z-50 animate-slide-up">
          <div className="flex items-center gap-2 rounded-lg border border-moss/30 bg-moss/15 px-4 py-2.5 shadow-card">
            <svg className="h-4 w-4 text-moss" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
            <span className="font-body text-sm font-medium text-moss">Saved</span>
          </div>
        </div>
      )}
    </div>
  )
}
