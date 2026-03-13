import { useCallback, useEffect, useRef, useState } from 'react'
import { apiClient } from '@/api/client'
import { PageHeader } from '@/shared/components/PageHeader'
import { ConfirmDialog } from '@/shared/components/ConfirmDialog'
import { LoadingSpinner } from '@/shared/components/LoadingSpinner'
import { cn } from '@/shared/utils/cn'

/* ── Types ─────────────────────────────────────────────────────────────── */

interface VaultDocument {
  id: string
  doc_type: string
  filename: string
  storage_path: string
  uploaded_at: string
  is_vault_doc: boolean
  application_count: number
}

/* ── Document type definitions ─────────────────────────────────────────── */

const DOC_TYPES = [
  {
    key: 'registration_certificate',
    label: 'Registration Certificate',
    description: 'Organisation registration document (e.g. Society, Trust, Sec 8)',
  },
  {
    key: 'audited_financials_y1',
    label: 'Audited Financials (Year 1)',
    description: 'Most recent year audited financial statement',
  },
  {
    key: 'audited_financials_y2',
    label: 'Audited Financials (Year 2)',
    description: 'Previous year audited financial statement',
  },
  {
    key: '80g_12a_certificate',
    label: '80G / 12A Certificate',
    description: 'Tax exemption certificate under Section 80G or 12A',
  },
  {
    key: 'fcra_certificate',
    label: 'FCRA Certificate',
    description: 'Foreign Contribution Regulation Act certificate (if applicable)',
  },
] as const

/* ── Icons ─────────────────────────────────────────────────────────────── */

function DocIcon({ className }: { className?: string }) {
  return (
    <svg
      className={cn('h-8 w-8', className)}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
      />
    </svg>
  )
}

function UploadIcon({ className }: { className?: string }) {
  return (
    <svg
      className={cn('h-5 w-5', className)}
      viewBox="0 0 20 20"
      fill="currentColor"
    >
      <path
        fillRule="evenodd"
        d="M10 3a.75.75 0 01.75.75v10.638l3.96-4.158a.75.75 0 111.08 1.04l-5.25 5.5a.75.75 0 01-1.08 0l-5.25-5.5a.75.75 0 111.08-1.04l3.96 4.158V3.75A.75.75 0 0110 3z"
        clipRule="evenodd"
        transform="rotate(180 10 10)"
      />
    </svg>
  )
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg
      className={cn('h-4 w-4', className)}
      viewBox="0 0 20 20"
      fill="currentColor"
    >
      <path
        fillRule="evenodd"
        d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z"
        clipRule="evenodd"
      />
    </svg>
  )
}

/* ── Component ─────────────────────────────────────────────────────────── */

export function DocumentVault() {
  const [documents, setDocuments] = useState<VaultDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<VaultDocument | null>(null)
  const [deleting, setDeleting] = useState(false)

  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({})

  /* ── Load documents ──────────────────────────────────────────────── */
  const fetchDocuments = useCallback(async () => {
    try {
      const { data } = await apiClient.get<VaultDocument[]>(
        '/v1/documents/vault',
      )
      setDocuments(data)
    } catch {
      setError('Failed to load documents.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchDocuments()
  }, [fetchDocuments])

  /* ── Upload handler ──────────────────────────────────────────────── */
  const handleUpload = useCallback(
    async (docType: string, file: File) => {
      // Client-side validation
      const allowed = [
        'application/pdf',
        'image/jpeg',
        'image/png',
      ]
      if (!allowed.includes(file.type)) {
        setError('Only PDF, JPG, and PNG files are accepted.')
        return
      }
      if (file.size > 10 * 1024 * 1024) {
        setError('File too large. Maximum size is 10 MB.')
        return
      }

      setError(null)
      setUploading(docType)

      const formData = new FormData()
      formData.append('file', file)
      formData.append('doc_type', docType)

      try {
        await apiClient.post('/v1/documents/vault', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
        await fetchDocuments()
      } catch (err: unknown) {
        const msg =
          (err as { response?: { data?: { detail?: string } } })?.response
            ?.data?.detail ?? 'Upload failed. Please try again.'
        setError(msg)
      } finally {
        setUploading(null)
        // Reset file input
        const input = fileInputRefs.current[docType]
        if (input) input.value = ''
      }
    },
    [fetchDocuments],
  )

  /* ── Delete handler ──────────────────────────────────────────────── */
  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await apiClient.delete(`/v1/documents/vault/${deleteTarget.id}`)
      await fetchDocuments()
      setDeleteTarget(null)
    } catch {
      setError('Failed to delete document.')
    } finally {
      setDeleting(false)
    }
  }, [deleteTarget, fetchDocuments])

  /* ── Helpers ─────────────────────────────────────────────────────── */
  const getDocForType = (docType: string) =>
    documents.find((d) => d.doc_type === docType)

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })

  /* ── Render ──────────────────────────────────────────────────────── */
  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <LoadingSpinner label="Loading your documents..." />
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title="Document Vault"
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Document Vault' },
        ]}
      />

      {error && (
        <div className="mb-4 rounded-lg border border-rust/30 bg-rust/10 px-4 py-3">
          <p className="font-body text-sm text-rust">{error}</p>
        </div>
      )}

      <p className="mb-6 font-body text-sm text-bark">
        Upload your organisation documents here. They will be available to
        attach to any grant application.{' '}
        <span className="text-sand">
          Accepted formats: PDF, JPG, PNG (max 10 MB).
        </span>
      </p>

      {/* Document grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {DOC_TYPES.map((docType) => {
          const existing = getDocForType(docType.key)
          const isUploading = uploading === docType.key

          return (
            <div
              key={docType.key}
              className={cn(
                'rounded-lg border bg-parchment shadow-card transition-shadow hover:shadow-card-hover',
                existing ? 'border-moss/40' : 'border-sand border-dashed',
              )}
            >
              <div className="p-5">
                {/* Header */}
                <div className="mb-3 flex items-start gap-3">
                  <DocIcon
                    className={existing ? 'text-clay' : 'text-sand'}
                  />
                  <div className="min-w-0 flex-1">
                    <h3 className="font-heading text-sm font-semibold text-soil">
                      {docType.label}
                    </h3>
                    <p className="mt-0.5 font-body text-xs text-sand">
                      {docType.description}
                    </p>
                  </div>
                </div>

                {/* Uploaded file info */}
                {existing && (
                  <div className="mb-3 rounded-md border border-sand/50 bg-cream px-3 py-2">
                    <p
                      className="truncate font-mono text-xs text-bark"
                      title={existing.filename}
                    >
                      {existing.filename}
                    </p>
                    <div className="mt-1 flex items-center justify-between">
                      <span className="font-body text-[10px] text-sand">
                        {formatDate(existing.uploaded_at)}
                      </span>
                      {existing.application_count > 0 && (
                        <span className="rounded-full bg-moss/10 px-2 py-0.5 font-mono text-[10px] font-medium text-moss">
                          Used in {existing.application_count} app
                          {existing.application_count > 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center gap-2">
                  {/* Hidden file input */}
                  <input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    className="hidden"
                    ref={(el) => {
                      fileInputRefs.current[docType.key] = el
                    }}
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) handleUpload(docType.key, file)
                    }}
                  />

                  <button
                    type="button"
                    disabled={isUploading}
                    onClick={() =>
                      fileInputRefs.current[docType.key]?.click()
                    }
                    className={cn(
                      'flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2',
                      'font-body text-xs font-medium transition-colors',
                      existing
                        ? 'border border-sand bg-cream text-bark hover:bg-parchment'
                        : 'bg-clay text-cream hover:bg-bark',
                      'disabled:cursor-not-allowed disabled:opacity-50',
                    )}
                  >
                    {isUploading ? (
                      <>
                        <LoadingSpinner size="sm" />
                        Uploading...
                      </>
                    ) : existing ? (
                      <>
                        <UploadIcon className="h-3.5 w-3.5" />
                        Replace
                      </>
                    ) : (
                      <>
                        <UploadIcon className="h-3.5 w-3.5" />
                        Upload
                      </>
                    )}
                  </button>

                  {existing && (
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(existing)}
                      className={cn(
                        'flex items-center justify-center rounded-md border border-sand p-2',
                        'text-sand transition-colors hover:border-rust hover:text-rust',
                      )}
                      aria-label={`Delete ${docType.label}`}
                    >
                      <TrashIcon />
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Delete confirmation dialog */}
      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Document"
        message={`Are you sure you want to delete "${deleteTarget?.filename}"? This action cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        loading={deleting}
      />
    </div>
  )
}
