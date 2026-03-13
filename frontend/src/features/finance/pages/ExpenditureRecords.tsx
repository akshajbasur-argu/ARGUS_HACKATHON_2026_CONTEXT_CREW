import { useState, useCallback } from 'react'
import { PageHeader } from '@/shared/components/PageHeader'
import { SectionCard } from '@/shared/components/SectionCard'
import { DataTable, type Column } from '@/shared/components/DataTable'
import { StatusPill } from '@/shared/components/StatusPill'
import { FormInput, FormTextarea } from '@/shared/components/FormField'
import { Modal } from '@/shared/components/Modal'
import { LoadingSpinner } from '@/shared/components/LoadingSpinner'
import { cn } from '@/shared/utils/cn'
import { formatINR } from '@/shared/utils/formatCurrency'
import { formatDate } from '@/shared/utils/formatDate'
import { apiClient } from '@/api/client'

interface ExpRecord {
  id: string
  application_id: string
  submitted_by: string
  date: string
  payee: string
  amount_inr: string
  budget_category: string
  description: string
  receipt_path: string | null
  status: string
  reviewer_notes: string | null
  submitted_at: string
  verified_at: string | null
  [key: string]: unknown
}

const STATUS_MAP: Record<string, string> = {
  pending: 'submitted',
  verified: 'approved',
  queried: 'rejected',
}

export function ExpenditureRecords() {
  const [appId, setAppId] = useState('')
  const [records, setRecords] = useState<ExpRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [searched, setSearched] = useState(false)

  // Verify modal
  const [verifyTarget, setVerifyTarget] = useState<ExpRecord | null>(null)
  const [verifyStatus, setVerifyStatus] = useState<'verified' | 'queried'>('verified')
  const [verifyNotes, setVerifyNotes] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [verifyError, setVerifyError] = useState('')

  const fetchRecords = useCallback(async () => {
    if (!appId.trim()) {
      setError('Please enter an application ID.')
      return
    }
    setLoading(true)
    setError('')
    setSearched(true)
    try {
      const res = await apiClient.get(`/v1/finance/expenditure/${appId.trim()}`)
      setRecords(res.data)
    } catch {
      setError('Failed to load expenditure records.')
      setRecords([])
    } finally {
      setLoading(false)
    }
  }, [appId])

  const openVerify = useCallback((r: ExpRecord) => {
    setVerifyTarget(r)
    setVerifyStatus('verified')
    setVerifyNotes('')
    setVerifyError('')
  }, [])

  const handleVerify = useCallback(async () => {
    if (!verifyTarget) return
    setVerifying(true)
    setVerifyError('')
    try {
      await apiClient.post(`/v1/finance/expenditure/${verifyTarget.id}/verify`, {
        status: verifyStatus,
        notes: verifyNotes.trim() || null,
      })
      setVerifyTarget(null)
      // Refresh
      const res = await apiClient.get(`/v1/finance/expenditure/${appId.trim()}`)
      setRecords(res.data)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setVerifyError(msg || 'Failed to verify expenditure.')
    } finally {
      setVerifying(false)
    }
  }, [verifyTarget, verifyStatus, verifyNotes, appId])

  const columns: Column<ExpRecord>[] = [
    {
      key: 'date',
      header: 'Date',
      sortable: true,
      render: (row) => <span className="font-mono text-xs">{formatDate(row.date)}</span>,
    },
    {
      key: 'payee',
      header: 'Payee',
      sortable: true,
      render: (row) => <span className="font-medium text-soil">{row.payee}</span>,
    },
    {
      key: 'amount_inr',
      header: 'Amount',
      sortable: true,
      render: (row) => <span className="font-mono text-sm">{formatINR(parseFloat(row.amount_inr))}</span>,
    },
    {
      key: 'budget_category',
      header: 'Category',
      render: (row) => <span className="font-body text-sm text-bark">{row.budget_category}</span>,
    },
    {
      key: 'description',
      header: 'Description',
      render: (row) => (
        <span className="font-body text-xs text-bark truncate block max-w-[200px]" title={row.description}>
          {row.description}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => <StatusPill status={STATUS_MAP[row.status] || row.status} />,
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (row) => {
        if (row.status !== 'pending') {
          return <span className="font-body text-xs text-sand">{row.reviewer_notes || '--'}</span>
        }
        return (
          <button
            type="button"
            onClick={() => openVerify(row)}
            className="rounded-md bg-clay px-3 py-1.5 font-body text-xs font-medium text-cream transition-colors hover:bg-bark"
          >
            Review
          </button>
        )
      },
    },
  ]

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Expenditure Records"
        breadcrumbs={[
          { label: 'Finance', href: '/finance/dashboard' },
          { label: 'Expenditure' },
        ]}
      />

      {/* Search by application ID */}
      <div className="mb-6 flex gap-3">
        <FormInput
          label="Application ID"
          value={appId}
          onChange={(e) => setAppId(e.target.value)}
          placeholder="Enter application UUID"
          className="flex-1"
        />
        <div className="flex items-end">
          <button
            type="button"
            onClick={fetchRecords}
            disabled={loading}
            className={cn(
              'rounded-md px-5 py-2 font-body text-sm font-medium transition-colors',
              'bg-clay text-cream hover:bg-bark',
              'disabled:cursor-not-allowed disabled:opacity-50',
            )}
          >
            {loading ? 'Loading...' : 'Search'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-rust/30 bg-rust/10 px-4 py-3">
          <p className="font-body text-sm text-rust">{error}</p>
        </div>
      )}

      {loading && <LoadingSpinner label="Loading expenditure records..." />}

      {searched && !loading && (
        <SectionCard noPadding>
          <DataTable
            columns={columns}
            data={records}
            keyExtractor={(row) => row.id}
            emptyMessage="No expenditure records found for this application."
            pageSize={15}
          />
        </SectionCard>
      )}

      {/* Verify modal */}
      <Modal
        open={!!verifyTarget}
        onClose={() => setVerifyTarget(null)}
        title="Review Expenditure"
        width="md"
      >
        {verifyTarget && (
          <div className="space-y-4">
            <div className="rounded-md bg-parchment p-4 border border-sand space-y-2">
              <div className="flex justify-between">
                <span className="font-body text-sm text-bark">Payee:</span>
                <span className="font-body text-sm font-medium text-soil">{verifyTarget.payee}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-body text-sm text-bark">Amount:</span>
                <span className="font-mono text-sm font-bold text-moss">{formatINR(parseFloat(verifyTarget.amount_inr))}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-body text-sm text-bark">Category:</span>
                <span className="font-body text-sm text-soil">{verifyTarget.budget_category}</span>
              </div>
              <div>
                <span className="font-body text-sm text-bark">Description:</span>
                <p className="font-body text-sm text-soil mt-1">{verifyTarget.description}</p>
              </div>
            </div>

            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="verifyStatus"
                  checked={verifyStatus === 'verified'}
                  onChange={() => setVerifyStatus('verified')}
                  className="h-4 w-4 border-sand text-moss focus:ring-moss/30"
                />
                <span className="font-body text-sm text-bark">Verified</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="verifyStatus"
                  checked={verifyStatus === 'queried'}
                  onChange={() => setVerifyStatus('queried')}
                  className="h-4 w-4 border-sand text-rust focus:ring-rust/30"
                />
                <span className="font-body text-sm text-bark">Queried</span>
              </label>
            </div>

            <FormTextarea
              label="Notes"
              value={verifyNotes}
              onChange={(e) => setVerifyNotes(e.target.value)}
              placeholder="Optional review notes..."
              rows={3}
            />

            {verifyError && (
              <div className="rounded-md border border-rust/30 bg-rust/10 px-3 py-2">
                <p className="font-body text-xs text-rust">{verifyError}</p>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setVerifyTarget(null)}
                disabled={verifying}
                className={cn(
                  'rounded-md border border-sand bg-cream px-4 py-2',
                  'font-body text-sm font-medium text-bark transition-colors hover:bg-parchment',
                  'disabled:cursor-not-allowed disabled:opacity-50',
                )}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleVerify}
                disabled={verifying}
                className={cn(
                  'rounded-md px-4 py-2 font-body text-sm font-medium transition-colors',
                  verifyStatus === 'verified'
                    ? 'bg-moss text-cream hover:bg-moss/90'
                    : 'bg-rust text-cream hover:bg-rust/90',
                  'disabled:cursor-not-allowed disabled:opacity-60',
                )}
              >
                {verifying ? 'Processing...' : verifyStatus === 'verified' ? 'Verify' : 'Query'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
