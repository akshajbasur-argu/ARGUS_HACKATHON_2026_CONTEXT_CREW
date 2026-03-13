import { useState, useEffect, useCallback } from 'react'
import { PageHeader } from '@/shared/components/PageHeader'
import { SectionCard } from '@/shared/components/SectionCard'
import { DataTable, type Column } from '@/shared/components/DataTable'
import { StatusPill } from '@/shared/components/StatusPill'
import { Modal } from '@/shared/components/Modal'
import { FormInput } from '@/shared/components/FormField'
import { LoadingSpinner } from '@/shared/components/LoadingSpinner'
import { formatINR } from '@/shared/utils/formatCurrency'
import { formatDate } from '@/shared/utils/formatDate'
import { apiClient } from '@/api/client'
import { cn } from '@/shared/utils/cn'

interface Disbursement {
  id: string
  application_id: string
  tranche_label: string
  amount_inr: string
  trigger_type: string
  status: string
  released_at: string | null
  bank_details: Record<string, any>
}

export function Disbursements() {
  const [items, setItems] = useState<Disbursement[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Release Modal State
  const [target, setTarget] = useState<Disbursement | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [form, setForm] = useState({
    bank_account: '',
    ifsc: '',
    beneficiary_name: '',
    payment_reference: '',
  })

  const fetchDisbursements = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await apiClient.get('/v1/finance/disbursements')
      setItems(res.data)
    } catch (err) {
      setError('Failed to load disbursements.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchDisbursements()
  }, [fetchDisbursements])

  const handleOpenRelease = (item: Disbursement) => {
    setTarget(item)
    setSubmitError('')
    setForm({
      bank_account: '',
      ifsc: '',
      beneficiary_name: '',
      payment_reference: '',
    })
  }

  const handleRelease = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!target) return

    setSubmitting(true)
    setSubmitError('')
    try {
      await apiClient.post(`/v1/finance/disbursements/${target.id}/release`, form)
      setTarget(null)
      fetchDisbursements()
    } catch (err: any) {
      const msg = err.response?.data?.detail || 'Failed to release tranche.'
      setSubmitError(Array.isArray(msg) ? msg[0].msg : msg)
    } finally {
      setSubmitting(false)
    }
  }

  const columns: Column<Disbursement>[] = [
    {
      key: 'application_id',
      header: 'Application',
      render: (row) => <span className="font-mono text-xs text-sand">{row.application_id.split('-')[0]}...</span>,
    },
    {
      key: 'tranche_label',
      header: 'Tranche',
      sortable: true,
      render: (row) => <span className="font-medium text-soil">{row.tranche_label}</span>,
    },
    {
      key: 'trigger_type',
      header: 'Trigger',
      render: (row) => <span className="text-xs uppercase text-bark">{row.trigger_type.replace('_', ' ')}</span>,
    },
    {
      key: 'amount_inr',
      header: 'Amount',
      sortable: true,
      render: (row) => <span className="font-mono font-semibold">{formatINR(parseFloat(row.amount_inr))}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      render: (row) => <StatusPill status={row.status} />,
    },
    {
      key: 'released_at',
      header: 'Released Date',
      render: (row) => row.released_at ? <span className="text-xs">{formatDate(row.released_at)}</span> : '--',
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (row) => (
        row.status !== 'disbursed' ? (
          <button
            onClick={() => handleOpenRelease(row)}
            className="rounded bg-clay px-3 py-1 text-xs font-medium text-cream hover:bg-bark transition-colors"
          >
            Release
          </button>
        ) : (
          <span className="text-xs text-moss font-medium">Completed</span>
        )
      ),
    },
  ]

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Disbursements"
        breadcrumbs={[{ label: 'Finance', href: '/finance/dashboard' }, { label: 'Disbursements' }]}
      />

      {error && (
        <div className="mb-4 rounded-md bg-rust/10 p-4 text-sm text-rust border border-rust/20">
          {error}
        </div>
      )}

      {loading ? (
        <LoadingSpinner label="Fetching disbursements..." />
      ) : (
        <SectionCard noPadding>
          <DataTable
            columns={columns}
            data={items}
            keyExtractor={(row) => row.id}
            emptyMessage="No disbursements found."
            pageSize={15}
          />
        </SectionCard>
      )}

      <Modal
        open={!!target}
        onClose={() => !submitting && setTarget(null)}
        title={`Release Tranche: ${target?.tranche_label}`}
        width="md"
      >
        <form onSubmit={handleRelease} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <FormInput
              label="Beneficiary Name"
              required
              value={form.beneficiary_name}
              onChange={(e) => setForm({ ...form, beneficiary_name: e.target.value })}
              placeholder="Full name"
            />
            <FormInput
              label="Bank Account Number"
              required
              value={form.bank_account}
              onChange={(e) => setForm({ ...form, bank_account: e.target.value })}
              placeholder="Account number"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <FormInput
              label="IFSC Code"
              required
              value={form.ifsc}
              onChange={(e) => setForm({ ...form, ifsc: e.target.value })}
              placeholder="ABCD0123456"
              maxLength={11}
            />
            <FormInput
              label="Payment Reference (UTR)"
              required
              value={form.payment_reference}
              onChange={(e) => setForm({ ...form, payment_reference: e.target.value })}
              placeholder="UTR number"
            />
          </div>

          {submitError && (
            <div className="text-xs text-rust bg-rust/5 p-2 rounded border border-rust/10">
              {submitError}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4 border-t border-sand">
            <button
              type="button"
              disabled={submitting}
              onClick={() => setTarget(null)}
              className="px-4 py-2 text-sm font-medium text-bark hover:bg-parchment rounded transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className={cn(
                "px-4 py-2 text-sm font-medium text-cream rounded transition-colors",
                submitting ? "bg-sand" : "bg-moss hover:bg-soil"
              )}
            >
              {submitting ? 'Processing...' : 'Confirm Release'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
