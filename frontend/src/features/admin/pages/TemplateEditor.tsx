import { useCallback, useEffect, useState } from 'react'
import { apiClient } from '@/api/client'
import { PageHeader } from '@/shared/components/PageHeader'
import { LoadingSpinner } from '@/shared/components/LoadingSpinner'
import { cn } from '@/shared/utils/cn'

/* ── Types ─────────────────────────────────────────────────────────────── */

interface Template {
  id: string
  code: string
  name: string
  body_text: string
  required_fields: string[]
  updated_at: string
}

type TabCode = 'award' | 'rejection' | 'agreement'

const TABS: { code: TabCode; label: string }[] = [
  { code: 'award', label: 'Award Letter' },
  { code: 'rejection', label: 'Rejection Letter' },
  { code: 'agreement', label: 'Agreement' },
]

/* ── Component ─────────────────────────────────────────────────────────── */

export function TemplateEditor() {
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<TabCode>('award')
  const [editText, setEditText] = useState('')
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const fetchTemplates = useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiClient.get('/v1/admin/templates')
      setTemplates(res.data)
      // Init edit text for first tab
      const active = (res.data as Template[]).find((t) => t.code === activeTab)
      if (active) setEditText(active.body_text)
    } catch {
      /* empty */
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchTemplates()
  }, [fetchTemplates])

  function handleTabChange(code: TabCode) {
    setActiveTab(code)
    const tpl = templates.find((t) => t.code === code)
    if (tpl) setEditText(tpl.body_text)
    setToast(null)
  }

  async function handleSave() {
    setSaving(true)
    setToast(null)
    try {
      const res = await apiClient.patch(`/v1/admin/templates/${activeTab}`, {
        body_text: editText,
      })
      if (res.data.updated) {
        setToast({ type: 'success', message: 'Template saved' })
        await fetchTemplates()
      } else {
        setToast({
          type: 'error',
          message: res.data.error || `Missing merge fields: ${(res.data.missing_fields || []).map((f: string) => `{{${f}}}`).join(', ')}`,
        })
      }
    } catch {
      setToast({ type: 'error', message: 'Failed to save template' })
    } finally {
      setSaving(false)
    }
  }

  // Auto-dismiss success toast
  useEffect(() => {
    if (toast?.type === 'success') {
      const t = setTimeout(() => setToast(null), 3000)
      return () => clearTimeout(t)
    }
  }, [toast])

  const currentTemplate = templates.find((t) => t.code === activeTab)

  if (loading) {
    return (
      <div className="flex h-60 items-center justify-center">
        <LoadingSpinner label="Loading templates..." />
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title="Template Editor"
        breadcrumbs={[{ label: 'Admin', href: '/admin/users' }, { label: 'Templates' }]}
      />

      {/* Tab bar */}
      <div className="mb-6 flex gap-1 border-b border-sand">
        {TABS.map((tab) => (
          <button
            key={tab.code}
            onClick={() => handleTabChange(tab.code)}
            className={cn(
              'px-4 py-2.5 font-heading text-sm font-medium transition-colors',
              activeTab === tab.code
                ? 'border-b-2 border-clay text-clay'
                : 'text-sand hover:text-bark',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-4">
        {/* Left: merge fields reference */}
        <div className="lg:col-span-1">
          <div className="rounded-lg border border-sand bg-cream p-4">
            <h3 className="font-heading text-sm font-semibold text-bark">
              Available Merge Fields
            </h3>
            <p className="mt-1 font-body text-xs text-sand">
              These fields will be replaced with actual data when generating documents.
            </p>
            <ul className="mt-3 space-y-1">
              {(currentTemplate?.required_fields ?? []).map((field) => (
                <li key={field}>
                  <code className="font-mono text-xs text-clay">
                    {`{{${field}}}`}
                  </code>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Right: editor */}
        <div className="lg:col-span-3">
          <div className="rounded-lg border border-sand bg-parchment">
            <textarea
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              rows={24}
              className="w-full rounded-t-lg border-0 bg-parchment px-4 py-3 font-mono text-xs text-soil leading-relaxed focus:outline-none focus:ring-0"
              spellCheck={false}
            />
            <div className="flex items-center gap-3 rounded-b-lg border-t border-sand bg-cream px-4 py-3">
              <button
                onClick={handleSave}
                disabled={saving}
                className="rounded-lg bg-moss px-5 py-2 font-heading text-sm font-semibold text-cream transition-colors hover:bg-moss/90 disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Template'}
              </button>

              {toast && (
                <p
                  className={cn(
                    'font-body text-sm font-medium',
                    toast.type === 'success' ? 'text-moss' : 'text-rust',
                  )}
                >
                  {toast.message}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
