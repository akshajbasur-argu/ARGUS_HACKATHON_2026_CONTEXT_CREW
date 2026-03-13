import { useState, useEffect, useCallback } from 'react'
import { PageHeader } from '@/shared/components/PageHeader'
import { SectionCard } from '@/shared/components/SectionCard'
import { DataTable, type Column } from '@/shared/components/DataTable'
import { StatusPill } from '@/shared/components/StatusPill'
import { Modal } from '@/shared/components/Modal'
import { FormInput } from '@/shared/components/FormField'
import { LoadingSpinner } from '@/shared/components/LoadingSpinner'
import { cn } from '@/shared/utils/cn'
import { formatINR } from '@/shared/utils/formatCurrency'
import { formatDateTime } from '@/shared/utils/formatDate'
import { apiClient } from '@/api/client'

interface Disbursement {
  id: string
  application_id: string
  tranche_label: string
  amount_inr: string
  trigger_type: string
  status: string
  released_at: string | null
  bank_details: Record<string, string>
  [key: string]: unknown
}

const STATUS_MAP: Record<string, string> = {
  pending: 'pending',
  ready: 'eligible',
  disbursed: 'approved',
}

const TRIGGER_LABELS: Record<string, string> = {
  inception: 'Inception',
  mid_project: 'Mid-Project',
  final: 'Final',
  milestone: 'Milestone',
  submission_approval: 'Submission Approval',
  milestone_1: 'Milestone 1',
  milestone_2: 'Milestone 2',
}

export function DisbursementSchedule() {
  const [disbursements, setDisbursements] = useState<Disbursement[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Release modal
  const [releaseTarget, setReleaseTarget] = useState<Disbursement | null>(null)
  const [bankAccount, setBankAccount] = useState('')
  const [ifsc, setIfsc] = useState('')
  const [beneficiaryName, setBeneficiaryName] = useState('')
  const [paymentReference, setPaymentReference] = useState('')
  const [releasing, setReleasing] = useState(false)
  const [releaseError, setReleaseError] = useState('')

  const fetchDisbursements = useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiClient.get('/v1/finance/disbursements')
      setDisbursements(res.data)
    } catch {
      setError('Failed to load disbursements.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchDisbursements()
  }, [fetchDisbursements])

  const openRelease = useCallback((d: Disbursement) => {
    setReleaseTarget(d)
    setBankAccount('')
    setIfsc('')
    setBeneficiaryName('')
    setPaymentReference('')
    setReleaseError('')
  }, [])

  const handleRelease = useCallback(async () => {
    if (!releaseTarget) return
    if (!bankAccount.trim() || !ifsc.trim() || !beneficiaryName.trim() || !paymentReference.trim()) {
      setReleaseError('All fields are required.')
      return
    }
    if (ifsc.trim().length !== 11) {
      setReleaseError('IFSC code must be exactly 11 characters.')
      return
    }

    setReleasing(true)
    setReleaseError('')

    try {
      await apiClient.post(`/v1/finance/disbursements/${releaseTarget.id}/release`, {
        bank_account: bankAccount.trim(),
        ifsc: ifsc.trim(),
        beneficiary_name: beneficiaryName.trim(),
        payment_reference: paymentReference.trim(),
      })
      setReleaseTarget(null)
      fetchDisbursements()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setReleaseError(msg || 'Failed to release tranche.')
    } finally {
      setReleasing(false)
    }
  }, [releaseTarget, bankAccount, ifsc, beneficiaryName, paymentReference, fetchDisbursements])

  const columns: Column<Disbursement>[] = [
    {
      key: 'tranche_label',
      header: 'Tranche',
      sortable: true,
      render: (row) => (
        <span className="font-medium text-soil">{row.tranche_label}</span>
      ),
    },
    {
      key: 'amount_inr',
      header: 'Amount',
      sortable: true,
      render: (row) => (
        <span className="font-mono text-sm">{formatINR(parseFloat(row.amount_inr))}</span>
      ),
    },
    {
      key: 'trigger_type',
      header: 'Trigger',
      render: (row) => (
        <span className="font-body text-sm text-bark">
          {TRIGGER_LABELS[row.trigger_type] || row.trigger_type}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      render: (row) => <StatusPill status={STATUS_MAP[row.status] || row.status} />,
    },
    {
      key: 'released_at',
      header: 'Released',
      render: (row) => (
        <span className="font-body text-sm text-bark">
          {row.released_at ? formatDateTime(row.released_at) : '--'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (row) => {
        if (row.status === 'disbursed') {
          return (
            <span className="font-body text-xs text-moss font-medium">Released</span>
          )
        }
        return (
          <button
            type="button"
            onClick={() => openRelease(row)}
            disabled={row.status === 'pending'}
            className={cn(
              'rounded-md px-3 py-1.5 font-body text-xs font-medium transition-colors',
              row.status === 'pending'
                ? 'bg-sand/30 text-sand cursor-not-allowed'
                : 'bg-clay text-cream hover:bg-bark',
            )}
          >
            Release Tranche
          </button>
        )
      },
    },
  ]

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl py-12">
        <LoadingSpinner label="Loading disbursements..." />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Disbursement Schedule"
        breadcrumbs={[
          { label: 'Finance', href: '/finance/dashboard' },
          { label: 'Disbursements' },
        ]}
      />

      {error && (
        <div className="mb-4 rounded-md border border-rust/30 bg-rust/10 px-4 py-3">
          <p className="font-body text-sm text-rust">{error}</p>
        </div>
      )}

      <SectionCard noPadding>
        <DataTable
          columns={columns}
          data={disbursements}
          keyExtractor={(row) => row.id}
          emptyMessage="No disbursement records found."
          pageSize={15}
        />
      </SectionCard>

      {/* Release Tranche Modal */}
      <Modal
        open={!!releaseTarget}
        onClose={() => setReleaseTarget(null)}
        title="Release Tranche"
        width="md"
      >
        {releaseTarget && (
          <div className="space-y-4">
            <div className="rounded-md bg-parchment p-4 border border-sand">
              <div className="flex justify-between">
                <span className="font-body text-sm text-bark">Tranche:</span>
                <span className="font-body text-sm font-medium text-soil">{releaseTarget.tranche_label}</span>
              </div>
              <div className="flex justify-between mt-1">
                <span className="font-body text-sm text-bark">Amount:</span>
                <span className="font-mono text-sm font-bold text-moss">
                  {formatINR(parseFloat(releaseTarget.amount_inr))}
                </span>
              </div>
            </div>

            <FormInput
              label="Bank Account Number"
              required
              value={bankAccount}
              onChange={(e) => setBankAccount(e.target.value)}
              placeholder="Enter bank account number"
            />

            <FormInput
              label="IFSC Code"
              required
              value={ifsc}
              onChange={(e) => setIfsc(e.target.value.toUpperCase())}
              placeholder="e.g. SBIN0001234"
              maxLength={11}
            />

            <FormInput
              label="Beneficiary Name"
              required
              value={beneficiaryName}
              onChange={(e) => setBeneficiaryName(e.target.value)}
              placeholder="Name as per bank records"
            />

            <FormInput
              label="Payment Reference"
              required
              value={paymentReference}
              onChange={(e) => setPaymentReference(e.target.value)}
              placeholder="UTR / Transaction reference"
            />

            {releaseError && (
              <div className="rounded-md border border-rust/30 bg-rust/10 px-4 py-3">
                <p className="font-body text-sm text-rust">{releaseError}</p>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setReleaseTarget(null)}
                disabled={releasing}
                className={cn(
                  'rounded-md border border-sand bg-cream px-4 py-2',
                  'font-body text-sm font-medium text-bark',
                  'transition-colors hover:bg-parchment',
                  'disabled:cursor-not-allowed disabled:opacity-50',
                )}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRelease}
                disabled={releasing}
                className={cn(
                  'rounded-md px-4 py-2',
                  'font-body text-sm font-medium',
                  'bg-clay text-cream hover:bg-bark transition-colors',
                  'disabled:cursor-not-allowed disabled:opacity-60',
                )}
              >
                {releasing ? 'Processing...' : 'Confirm Release'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
