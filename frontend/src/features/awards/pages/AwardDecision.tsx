import { useState, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { PageHeader } from '@/shared/components/PageHeader'
import { SectionCard } from '@/shared/components/SectionCard'
import { FormTextarea } from '@/shared/components/FormField'
import { LoadingSpinner } from '@/shared/components/LoadingSpinner'
import { ConfirmDialog } from '@/shared/components/ConfirmDialog'
import { StatusPill } from '@/shared/components/StatusPill'
import { cn } from '@/shared/utils/cn'
import { apiClient } from '@/api/client'

type Decision = 'approved' | 'rejected' | 'waitlisted'

interface LetterPreview {
  html: string
  letter_type: string
  status: string
}

const DECISION_STYLES: Record<Decision, { bg: string; label: string; variant: 'default' | 'danger' | 'warning' }> = {
  approved:   { bg: 'bg-moss text-cream hover:bg-moss/90',   label: 'Approve',   variant: 'default' },
  rejected:   { bg: 'bg-rust text-cream hover:bg-rust/90',   label: 'Reject',    variant: 'danger' },
  waitlisted: { bg: 'bg-amber text-cream hover:bg-amber/90', label: 'Waitlist',  variant: 'warning' },
}

export function AwardDecision() {
  const { id: appId } = useParams<{ id: string }>()

  const [decision, setDecision] = useState<Decision | null>(null)
  const [reason, setReason] = useState('')
  const [reasonError, setReasonError] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [submitError, setSubmitError] = useState('')

  const [letterPreview, setLetterPreview] = useState<LetterPreview | null>(null)
  const [letterLoading, setLetterLoading] = useState(false)

  const [confirmOpen, setConfirmOpen] = useState(false)
  const [sendingLetter, setSendingLetter] = useState(false)
  const [letterSent, setLetterSent] = useState(false)

  const handleDecision = useCallback(async (d: Decision) => {
    if (!reason.trim()) {
      setReasonError('Please provide a reason for your decision.')
      return
    }
    setReasonError('')
    setDecision(d)
    setSubmitting(true)
    setSubmitError('')

    try {
      await apiClient.post(`/v1/awards/staff/${appId}/decision`, {
        decision: d,
        reason: reason.trim(),
      })
      setSubmitted(true)

      // Fetch letter preview
      setLetterLoading(true)
      const res = await apiClient.get(`/v1/awards/staff/${appId}/letter`)
      setLetterPreview(res.data)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setSubmitError(msg || 'Failed to record decision. Please try again.')
      setDecision(null)
    } finally {
      setSubmitting(false)
      setLetterLoading(false)
    }
  }, [appId, reason])

  const handleSendLetter = useCallback(async () => {
    setSendingLetter(true)
    try {
      await apiClient.post(`/v1/awards/staff/${appId}/send-letter`)
      setLetterSent(true)
      setConfirmOpen(false)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setSubmitError(msg || 'Failed to send letter.')
    } finally {
      setSendingLetter(false)
    }
  }, [appId])

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Award Decision"
        breadcrumbs={[
          { label: 'Applications', href: '/staff/applications' },
          { label: 'Decision' },
        ]}
      />

      {/* Decision form */}
      {!submitted && (
        <SectionCard title="Record Decision">
          <div className="space-y-5">
            <FormTextarea
              label="Decision Reason"
              required
              value={reason}
              onChange={(e) => {
                setReason(e.target.value)
                if (reasonError) setReasonError('')
              }}
              error={reasonError}
              placeholder="Provide a detailed rationale for your decision..."
              rows={5}
            />

            {submitError && (
              <div className="rounded-md border border-rust/30 bg-rust/10 px-4 py-3">
                <p className="font-body text-sm text-rust">{submitError}</p>
              </div>
            )}

            <div className="flex flex-wrap gap-3">
              {(Object.keys(DECISION_STYLES) as Decision[]).map((d) => (
                <button
                  key={d}
                  type="button"
                  disabled={submitting}
                  onClick={() => handleDecision(d)}
                  className={cn(
                    'rounded-md px-5 py-2.5 font-body text-sm font-medium transition-colors',
                    'disabled:cursor-not-allowed disabled:opacity-50',
                    DECISION_STYLES[d].bg,
                  )}
                >
                  {submitting && decision === d ? 'Processing...' : DECISION_STYLES[d].label}
                </button>
              ))}
            </div>
          </div>
        </SectionCard>
      )}

      {/* Decision confirmed */}
      {submitted && decision && (
        <SectionCard title="Decision Recorded">
          <div className="flex items-center gap-3 mb-2">
            <span className="font-body text-sm text-bark">Decision:</span>
            <StatusPill status={decision} />
          </div>
          <p className="font-body text-sm text-bark">
            <strong>Reason:</strong> {reason}
          </p>
        </SectionCard>
      )}

      {/* Letter preview */}
      {letterLoading && (
        <div className="mt-6">
          <LoadingSpinner label="Generating letter..." />
        </div>
      )}

      {letterPreview && (
        <div className="mt-6">
          <SectionCard title={`${letterPreview.letter_type === 'award' ? 'Award' : 'Rejection'} Letter Preview`}>
            <div className="flex items-center gap-3 mb-4">
              <StatusPill status={letterSent ? 'sent' : letterPreview.status} />
              {letterSent && (
                <span className="font-body text-sm text-moss font-medium">
                  Letter sent successfully
                </span>
              )}
            </div>

            {/* HTML letter render */}
            <div
              className="rounded-md border border-sand bg-cream p-4 overflow-auto max-h-[500px]"
              dangerouslySetInnerHTML={{ __html: letterPreview.html }}
            />

            {/* Send button */}
            {!letterSent && (
              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  onClick={() => setConfirmOpen(true)}
                  className={cn(
                    'rounded-md px-5 py-2.5 font-body text-sm font-medium transition-colors',
                    'bg-clay text-cream hover:bg-bark',
                  )}
                >
                  Confirm & Send Letter
                </button>
              </div>
            )}
          </SectionCard>
        </div>
      )}

      {/* Confirm send dialog */}
      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={handleSendLetter}
        title="Send Letter"
        message="Are you sure you want to send this letter to the applicant? This action cannot be undone."
        confirmLabel="Send"
        variant="default"
        loading={sendingLetter}
      />
    </div>
  )
}
