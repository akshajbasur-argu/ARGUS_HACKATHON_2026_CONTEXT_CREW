import { useState, useEffect, useCallback } from 'react'
import { PageHeader } from '@/shared/components/PageHeader'
import { SectionCard } from '@/shared/components/SectionCard'
import { DataTable, type Column } from '@/shared/components/DataTable'
import { StatusPill } from '@/shared/components/StatusPill'
import { FormInput, FormSelect } from '@/shared/components/FormField'
import { Modal } from '@/shared/components/Modal'
import { ConfirmDialog } from '@/shared/components/ConfirmDialog'
import { LoadingSpinner } from '@/shared/components/LoadingSpinner'
import { cn } from '@/shared/utils/cn'
import { formatDateTime } from '@/shared/utils/formatDate'
import { apiClient } from '@/api/client'

interface UserRow {
  id: string
  email: string
  full_name: string
  phone: string | null
  role: string
  is_active: boolean
  created_at: string
  updated_at: string
  [key: string]: unknown
}

const ROLE_STYLES: Record<string, string> = {
  platform_admin:   'bg-rust/15 text-rust border-rust/40',
  program_officer:  'bg-clay/15 text-clay border-clay/40',
  reviewer:         'bg-water/15 text-water border-water/40',
  finance_officer:  'bg-moss/15 text-moss border-moss/40',
  applicant:        'bg-sand/20 text-soil border-sand',
}

const STAFF_ROLE_OPTIONS = [
  { value: 'program_officer', label: 'Programme Officer' },
  { value: 'reviewer', label: 'Reviewer' },
  { value: 'finance_officer', label: 'Finance Officer' },
  { value: 'platform_admin', label: 'Platform Admin' },
]

export function UserManagement() {
  const [users, setUsers] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Create modal
  const [showCreate, setShowCreate] = useState(false)
  const [createName, setCreateName] = useState('')
  const [createEmail, setCreateEmail] = useState('')
  const [createRole, setCreateRole] = useState('program_officer')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')

  // Deactivate
  const [deactivateTarget, setDeactivateTarget] = useState<UserRow | null>(null)
  const [deactivating, setDeactivating] = useState(false)

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiClient.get('/v1/admin/users')
      setUsers(res.data)
    } catch {
      setError('Failed to load users.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchUsers()
  }, [fetchUsers])

  const handleCreate = useCallback(async () => {
    if (!createName.trim() || !createEmail.trim()) {
      setCreateError('Name and email are required.')
      return
    }
    setCreating(true)
    setCreateError('')
    try {
      await apiClient.post('/v1/admin/users', {
        full_name: createName.trim(),
        email: createEmail.trim(),
        role: createRole,
      })
      setShowCreate(false)
      setCreateName('')
      setCreateEmail('')
      setCreateRole('program_officer')
      await fetchUsers()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setCreateError(msg || 'Failed to create account.')
    } finally {
      setCreating(false)
    }
  }, [createName, createEmail, createRole, fetchUsers])

  const handleDeactivate = useCallback(async () => {
    if (!deactivateTarget) return
    setDeactivating(true)
    try {
      await apiClient.patch(`/v1/admin/users/${deactivateTarget.id}/deactivate`)
      setDeactivateTarget(null)
      await fetchUsers()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(msg || 'Failed to deactivate user.')
    } finally {
      setDeactivating(false)
    }
  }, [deactivateTarget, fetchUsers])

  const columns: Column<UserRow>[] = [
    {
      key: 'full_name',
      header: 'Name',
      sortable: true,
      render: (row) => (
        <div>
          <span className="font-medium text-soil">{row.full_name}</span>
          <p className="font-body text-xs text-bark">{row.email}</p>
        </div>
      ),
    },
    {
      key: 'role',
      header: 'Role',
      sortable: true,
      render: (row) => (
        <span
          className={cn(
            'inline-flex items-center rounded-pill border px-2.5 py-0.5',
            'font-mono text-xs font-medium tracking-wide uppercase',
            ROLE_STYLES[row.role] || 'bg-sand/20 text-soil border-sand',
          )}
        >
          {row.role.replace(/_/g, ' ')}
        </span>
      ),
    },
    {
      key: 'is_active',
      header: 'Status',
      render: (row) => (
        <StatusPill status={row.is_active ? 'active' : 'closed'} />
      ),
    },
    {
      key: 'created_at',
      header: 'Created',
      sortable: true,
      render: (row) => (
        <span className="font-mono text-xs text-bark">{formatDateTime(row.created_at)}</span>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (row) => {
        if (!row.is_active) {
          return <span className="font-body text-xs text-sand">Inactive</span>
        }
        return (
          <button
            type="button"
            onClick={() => setDeactivateTarget(row)}
            className="rounded-md bg-rust/10 px-3 py-1.5 font-body text-xs font-medium text-rust transition-colors hover:bg-rust/20"
          >
            Deactivate
          </button>
        )
      },
    },
  ]

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl py-12">
        <LoadingSpinner label="Loading users..." />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="User Management"
        breadcrumbs={[{ label: 'Admin' }, { label: 'Users' }]}
      />

      {error && (
        <div className="mb-4 rounded-md border border-rust/30 bg-rust/10 px-4 py-3">
          <p className="font-body text-sm text-rust">{error}</p>
        </div>
      )}

      {/* Create button */}
      <div className="mb-4 flex justify-end">
        <button
          type="button"
          onClick={() => {
            setShowCreate(true)
            setCreateError('')
          }}
          className="rounded-md bg-clay px-4 py-2 font-body text-sm font-medium text-cream transition-colors hover:bg-bark"
        >
          Create Staff Account
        </button>
      </div>

      <SectionCard noPadding>
        <DataTable
          columns={columns}
          data={users}
          keyExtractor={(row) => row.id}
          emptyMessage="No users found."
          pageSize={20}
        />
      </SectionCard>

      {/* Create modal */}
      <Modal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title="Create Staff Account"
        width="md"
      >
        <div className="space-y-4">
          <FormInput
            label="Full Name"
            required
            value={createName}
            onChange={(e) => setCreateName(e.target.value)}
            placeholder="Enter full name"
          />
          <FormInput
            label="Email"
            required
            type="email"
            value={createEmail}
            onChange={(e) => setCreateEmail(e.target.value)}
            placeholder="Enter email address"
          />
          <FormSelect
            label="Role"
            required
            value={createRole}
            onChange={(e) => setCreateRole((e.target as HTMLSelectElement).value)}
            options={STAFF_ROLE_OPTIONS}
          />

          {createError && (
            <div className="rounded-md border border-rust/30 bg-rust/10 px-3 py-2">
              <p className="font-body text-xs text-rust">{createError}</p>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              disabled={creating}
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
              onClick={handleCreate}
              disabled={creating}
              className={cn(
                'rounded-md bg-clay px-4 py-2 font-body text-sm font-medium text-cream',
                'transition-colors hover:bg-bark',
                'disabled:cursor-not-allowed disabled:opacity-60',
              )}
            >
              {creating ? 'Creating...' : 'Create Account'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Deactivate confirm */}
      <ConfirmDialog
        open={!!deactivateTarget}
        onClose={() => setDeactivateTarget(null)}
        onConfirm={handleDeactivate}
        title="Deactivate User"
        message={`Are you sure you want to deactivate ${deactivateTarget?.full_name} (${deactivateTarget?.email})? They will no longer be able to log in.`}
        confirmLabel="Deactivate"
        variant="danger"
        loading={deactivating}
      />
    </div>
  )
}
