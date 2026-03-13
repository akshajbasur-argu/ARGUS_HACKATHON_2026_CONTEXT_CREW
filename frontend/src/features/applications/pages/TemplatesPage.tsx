import { useState, useEffect, useCallback } from 'react'
import { PageHeader } from '@/shared/components/PageHeader'
import { SectionCard } from '@/shared/components/SectionCard'
import { LoadingSpinner } from '@/shared/components/LoadingSpinner'
import { cn } from '@/shared/utils/cn'
import { apiClient } from '@/api/client'

interface Template {
  id: string
  code: string
  name: string
  body_text: string
  required_fields: string[]
  updated_at: string
}

export function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([])
  const [activeTab, setActiveTab] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchTemplates = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await apiClient.get<Template[]>('/v1/admin/templates')
      const data = Array.isArray(res.data) ? res.data : []
      setTemplates(data)
      if (data.length > 0 && !activeTab) {
        setActiveTab(data[0].code)
      }
    } catch {
      setError('Failed to load templates. Please try again later.')
    } finally {
      setLoading(false)
    }
  }, [activeTab])

  useEffect(() => {
    fetchTemplates()
  }, [fetchTemplates])

  const activeTemplate = templates.find((t) => t.code === activeTab) ?? null

  const formatFieldName = (field: string) =>
    field
      .replace(/[_-]/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase())

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    } catch {
      return iso
    }
  }

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Letter Templates"
        breadcrumbs={[
          { label: 'Applications', href: '/applications' },
          { label: 'Templates' },
        ]}
      />

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <LoadingSpinner />
        </div>
      ) : error ? (
        <SectionCard>
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <p className="text-bark">{error}</p>
            <button
              onClick={fetchTemplates}
              className="rounded-md bg-clay px-4 py-2 text-sm font-medium text-cream transition-colors hover:bg-bark"
            >
              Retry
            </button>
          </div>
        </SectionCard>
      ) : templates.length === 0 ? (
        <SectionCard>
          <p className="py-10 text-center text-bark">
            No templates available.
          </p>
        </SectionCard>
      ) : (
        <>
          {/* Tab bar */}
          <div className="mb-6 flex gap-1 overflow-x-auto rounded-lg border border-sand bg-parchment p-1">
            {templates.map((t) => (
              <button
                key={t.code}
                onClick={() => setActiveTab(t.code)}
                className={cn(
                  'whitespace-nowrap rounded-md px-4 py-2 text-sm font-medium transition-colors',
                  activeTab === t.code
                    ? 'bg-soil text-cream shadow-sm'
                    : 'text-bark hover:bg-sand/40 hover:text-soil',
                )}
              >
                {t.name}
              </button>
            ))}
          </div>

          {activeTemplate && (
            <div className="flex flex-col gap-6">
              {/* Template preview */}
              <SectionCard title="Template Preview">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-xs text-clay">
                    Last updated: {formatDate(activeTemplate.updated_at)}
                  </p>
                  <span className="rounded-full bg-sand/50 px-2.5 py-0.5 font-mono text-xs text-bark">
                    {activeTemplate.code}
                  </span>
                </div>
                <div
                  className="prose prose-sm max-w-none rounded-md border border-sand bg-cream p-5 text-soil"
                  dangerouslySetInnerHTML={{ __html: activeTemplate.body_text }}
                />
              </SectionCard>

              {/* Required merge fields */}
              <SectionCard title="Required Merge Fields">
                {activeTemplate.required_fields.length === 0 ? (
                  <p className="text-sm text-bark">
                    No merge fields required for this template.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {activeTemplate.required_fields.map((field) => (
                      <span
                        key={field}
                        className="inline-flex items-center rounded-md border border-sand bg-cream px-3 py-1.5 font-mono text-xs text-soil"
                      >
                        <span className="mr-1.5 text-clay">{'{{ '}</span>
                        {formatFieldName(field)}
                        <span className="ml-1.5 text-clay">{' }}'}</span>
                      </span>
                    ))}
                  </div>
                )}
                <p className="mt-4 text-xs text-clay">
                  These fields will be automatically populated when generating
                  letters from application data.
                </p>
              </SectionCard>
            </div>
          )}
        </>
      )}
    </div>
  )
}
