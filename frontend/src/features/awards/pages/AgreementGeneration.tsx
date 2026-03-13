import { useState, useCallback, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { PageHeader } from '@/shared/components/PageHeader'
import { SectionCard } from '@/shared/components/SectionCard'
import { FormTextarea, FormInput, FormSelect } from '@/shared/components/FormField'
import { LoadingSpinner } from '@/shared/components/LoadingSpinner'
import { ConfirmDialog } from '@/shared/components/ConfirmDialog'
import { cn } from '@/shared/utils/cn'
import { formatINR } from '@/shared/utils/formatCurrency'
import { apiClient } from '@/api/client'

interface Tranche {
  id: string
  label: string
  amount_inr: string
  trigger_type: string
  notes: string
}

const TRIGGER_OPTIONS = [
  { value: 'inception', label: 'Inception' },
  { value: 'mid_project', label: 'Mid-Project' },
  { value: 'final', label: 'Final' },
  { value: 'milestone', label: 'Milestone' },
]

let nextId = 1
function makeId() {
  return `tranche-${nextId++}`
}

function emptyTranche(): Tranche {
  return { id: makeId(), label: '', amount_inr: '', trigger_type: 'inception', notes: '' }
}

export function AgreementGeneration() {
  const { id: appId } = useParams<{ id: string }>()

  const [specialConditions, setSpecialConditions] = useState('')
  const [tranches, setTranches] = useState<Tranche[]>([emptyTranche()])
  const [awardAmount] = useState<number | null>(null)

  const [savingTranches, setSavingTranches] = useState(false)
  const [tranchesSaved, setTranchesSaved] = useState(false)

  const [generating, setGenerating] = useState(false)
  const [agreementHtml, setAgreementHtml] = useState<string | null>(null)
  const [generateError, setGenerateError] = useState('')

  const [confirmSendOpen, setConfirmSendOpen] = useState(false)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [sendError, setSendError] = useState('')

  // Running total
  const runningTotal = useMemo(() => {
    return tranches.reduce((sum, t) => {
      const val = parseFloat(t.amount_inr)
      return sum + (isNaN(val) ? 0 : val)
    }, 0)
  }, [tranches])

  const totalMismatch = awardAmount !== null && Math.abs(runningTotal - awardAmount) > 0.01

  // Tranche management
  const addTranche = useCallback(() => {
    setTranches((prev) => [...prev, emptyTranche()])
    setTranchesSaved(false)
  }, [])

  const removeTranche = useCallback((id: string) => {
    setTranches((prev) => prev.filter((t) => t.id !== id))
    setTranchesSaved(false)
  }, [])

  const updateTranche = useCallback((id: string, field: keyof Tranche, value: string) => {
    setTranches((prev) =>
      prev.map((t) => (t.id === id ? { ...t, [field]: value } : t))
    )
    setTranchesSaved(false)
  }, [])

  // Save tranches
  const handleSaveTranches = useCallback(async () => {
    const valid = tranches.every((t) => t.label.trim() && t.amount_inr && parseFloat(t.amount_inr) > 0)
    if (!valid) {
      setGenerateError('All tranches must have a label and a positive amount.')
      return
    }
    setGenerateError('')
    setSavingTranches(true)

    try {
      await apiClient.post(`/v1/awards/staff/${appId}/tranches`, {
        tranches: tranches.map((t) => ({
          label: t.label.trim(),
          amount_inr: parseFloat(t.amount_inr),
          trigger_type: t.trigger_type,
          notes: t.notes.trim() || null,
        })),
      })
      setTranchesSaved(true)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setGenerateError(msg || 'Failed to save tranches.')
    } finally {
      setSavingTranches(false)
    }
  }, [appId, tranches])

  // Generate agreement
  const handleGenerate = useCallback(async () => {
    setGenerating(true)
    setGenerateError('')

    try {
      // Save tranches first if not saved
      if (!tranchesSaved) {
        const valid = tranches.every((t) => t.label.trim() && t.amount_inr && parseFloat(t.amount_inr) > 0)
        if (!valid) {
          setGenerateError('All tranches must have a label and a positive amount.')
          setGenerating(false)
          return
        }
        await apiClient.post(`/v1/awards/staff/${appId}/tranches`, {
          tranches: tranches.map((t) => ({
            label: t.label.trim(),
            amount_inr: parseFloat(t.amount_inr),
            trigger_type: t.trigger_type,
            notes: t.notes.trim() || null,
          })),
        })
        setTranchesSaved(true)
      }

      const res = await apiClient.post(`/v1/awards/staff/${appId}/generate-agreement`, {
        special_conditions: specialConditions.trim() || null,
      })
      setAgreementHtml(res.data.html_content)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setGenerateError(msg || 'Failed to generate agreement.')
    } finally {
      setGenerating(false)
    }
  }, [appId, specialConditions, tranches, tranchesSaved])

  // Send agreement
  const handleSendAgreement = useCallback(async () => {
    setSending(true)
    setSendError('')

    try {
      await apiClient.post(`/v1/awards/staff/${appId}/send-agreement`)
      setSent(true)
      setConfirmSendOpen(false)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setSendError(msg || 'Failed to send agreement.')
    } finally {
      setSending(false)
    }
  }, [appId])

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Grant Agreement"
        breadcrumbs={[
          { label: 'Applications', href: '/staff/applications' },
          { label: 'Agreement' },
        ]}
      />

      {/* Special conditions */}
      <SectionCard title="Special Conditions">
        <FormTextarea
          label="Additional Conditions"
          value={specialConditions}
          onChange={(e) => setSpecialConditions(e.target.value)}
          placeholder="Enter any special conditions to include in the agreement..."
          hint="These will be added to the standard grant agreement terms."
          rows={4}
        />
      </SectionCard>

      {/* Disbursement tranche builder */}
      <div className="mt-6">
        <SectionCard title="Disbursement Schedule">
          <div className="space-y-4">
            {tranches.map((tranche, idx) => (
              <div
                key={tranche.id}
                className="rounded-md border border-sand bg-cream p-4"
              >
                <div className="mb-3 flex items-center justify-between">
                  <span className="font-heading text-sm font-semibold text-bark">
                    Tranche {idx + 1}
                  </span>
                  {tranches.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeTranche(tranche.id)}
                      className="rounded-md px-2 py-1 font-body text-xs text-rust hover:bg-rust/10 transition-colors"
                    >
                      Remove
                    </button>
                  )}
                </div>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <FormInput
                    label="Label"
                    required
                    value={tranche.label}
                    onChange={(e) => updateTranche(tranche.id, 'label', e.target.value)}
                    placeholder="e.g. Inception Tranche"
                  />
                  <FormInput
                    label="Amount (INR)"
                    required
                    type="number"
                    min="0"
                    step="0.01"
                    value={tranche.amount_inr}
                    onChange={(e) => updateTranche(tranche.id, 'amount_inr', e.target.value)}
                    placeholder="0.00"
                  />
                  <FormSelect
                    label="Trigger Type"
                    required
                    options={TRIGGER_OPTIONS}
                    value={tranche.trigger_type}
                    onChange={(e) => updateTranche(tranche.id, 'trigger_type', (e.target as HTMLSelectElement).value)}
                  />
                  <FormInput
                    label="Notes"
                    value={tranche.notes}
                    onChange={(e) => updateTranche(tranche.id, 'notes', e.target.value)}
                    placeholder="Optional notes"
                  />
                </div>
              </div>
            ))}

            {/* Add tranche button */}
            <button
              type="button"
              onClick={addTranche}
              className={cn(
                'w-full rounded-md border-2 border-dashed border-sand py-3',
                'font-body text-sm text-bark transition-colors hover:border-clay hover:text-clay',
              )}
            >
              + Add Tranche
            </button>

            {/* Running total */}
            <div className={cn(
              'flex items-center justify-between rounded-md px-4 py-3',
              totalMismatch ? 'bg-clay/10 border border-clay/30' : 'bg-parchment border border-sand',
            )}>
              <span className="font-heading text-sm font-semibold text-bark">Running Total</span>
              <span className={cn(
                'font-mono text-sm font-bold',
                totalMismatch ? 'text-clay' : 'text-moss',
              )}>
                {formatINR(runningTotal)}
              </span>
            </div>

            {totalMismatch && (
              <p className="font-body text-xs text-clay">
                Total does not match award amount ({formatINR(awardAmount!)}). Please adjust tranches.
              </p>
            )}

            {/* Save tranches */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleSaveTranches}
                disabled={savingTranches}
                className={cn(
                  'rounded-md px-4 py-2 font-body text-sm font-medium transition-colors',
                  'bg-clay text-cream hover:bg-bark',
                  'disabled:cursor-not-allowed disabled:opacity-50',
                )}
              >
                {savingTranches ? 'Saving...' : 'Save Tranches'}
              </button>
              {tranchesSaved && (
                <span className="font-body text-sm text-moss font-medium">Tranches saved</span>
              )}
            </div>
          </div>
        </SectionCard>
      </div>

      {/* Generate agreement */}
      <div className="mt-6">
        <SectionCard title="Generate Agreement">
          {generateError && (
            <div className="mb-4 rounded-md border border-rust/30 bg-rust/10 px-4 py-3">
              <p className="font-body text-sm text-rust">{generateError}</p>
            </div>
          )}

          <button
            type="button"
            onClick={handleGenerate}
            disabled={generating}
            className={cn(
              'rounded-md px-5 py-2.5 font-body text-sm font-medium transition-colors',
              'bg-clay text-cream hover:bg-bark',
              'disabled:cursor-not-allowed disabled:opacity-50',
            )}
          >
            {generating ? 'Generating...' : 'Generate Agreement Preview'}
          </button>

          {generating && (
            <div className="mt-4">
              <LoadingSpinner label="Generating agreement..." />
            </div>
          )}
        </SectionCard>
      </div>

      {/* Agreement preview */}
      {agreementHtml && (
        <div className="mt-6">
          <SectionCard title="Agreement Preview">
            <div
              className="rounded-md border border-sand bg-cream p-4 overflow-auto max-h-[600px]"
              dangerouslySetInnerHTML={{ __html: agreementHtml }}
            />

            {sendError && (
              <div className="mt-4 rounded-md border border-rust/30 bg-rust/10 px-4 py-3">
                <p className="font-body text-sm text-rust">{sendError}</p>
              </div>
            )}

            {!sent ? (
              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  onClick={() => setConfirmSendOpen(true)}
                  className={cn(
                    'rounded-md px-5 py-2.5 font-body text-sm font-medium transition-colors',
                    'bg-moss text-cream hover:bg-moss/90',
                  )}
                >
                  Send Agreement to Grantee
                </button>
              </div>
            ) : (
              <div className="mt-4 rounded-md border border-moss/30 bg-moss/10 px-4 py-3">
                <p className="font-body text-sm text-moss font-medium">
                  Agreement sent successfully. Awaiting grantee acknowledgement.
                </p>
              </div>
            )}
          </SectionCard>
        </div>
      )}

      {/* Confirm send dialog */}
      <ConfirmDialog
        open={confirmSendOpen}
        onClose={() => setConfirmSendOpen(false)}
        onConfirm={handleSendAgreement}
        title="Send Agreement"
        message="Send this agreement to the grantee? They will receive a notification with a link to review and acknowledge the agreement."
        confirmLabel="Send Agreement"
        variant="default"
        loading={sending}
      />
    </div>
  )
}
