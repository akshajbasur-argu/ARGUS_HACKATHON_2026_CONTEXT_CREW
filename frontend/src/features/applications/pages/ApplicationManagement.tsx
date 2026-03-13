import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { PageHeader } from '@/shared/components/PageHeader'
import { SectionCard } from '@/shared/components/SectionCard'
import { StatusPill } from '@/shared/components/StatusPill'
import { LoadingSpinner } from '@/shared/components/LoadingSpinner'
import { cn } from '@/shared/utils/cn'
import { formatDateTime } from '@/shared/utils/formatDate'
import { apiClient } from '@/api/client'

/* ── Types ─────────────────────────────────────────────────────────────────── */

interface ApplicationDetail {
  id: string
  reference_number: string
  programme_id: string
  programme_name: string
  applicant_id: string
  status: string
  current_stage: string | null
  form_data: Record<string, unknown>
  submitted_at: string | null
  updated_at: string
  [key: string]: unknown
}

interface TimelineEvent {
  event: string
  timestamp: string
  actor?: string
  detail?: string
}

/* ── Helpers ───────────────────────────────────────────────────────────────── */

function getProjectTitle(app: ApplicationDetail): string {
  const fd = app.form_data
  if (typeof fd?.project_title === 'string') return fd.project_title
  if (typeof fd?.title === 'string') return fd.title
  return app.reference_number
}

/** Map a timeline event name to a colour token class for the dot indicator. */
function eventDotColor(event: string): string {
  if (event.includes('submit')) return 'bg-water'
  if (event.includes('screen') || event.includes('eligible')) return 'bg-amber'
  if (event.includes('review')) return 'bg-clay'
  if (event.includes('approv')) return 'bg-moss'
  if (event.includes('reject') || event.includes('ineligib')) return 'bg-rust'
  return 'bg-sand'
}

function humaniseEvent(event: string): string {
  return event
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

/* ── Component ─────────────────────────────────────────────────────────────── */

export function ApplicationManagement() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [application, setApplication] = useState<ApplicationDetail | null>(null)
  const [timeline, setTimeline] = useState<TimelineEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  /* ── Data fetching ─────────────────────────────────────────────────────── */

  const fetchData = useCallback(async () => {
    if (!id) return
    setLoading(true)
    setError(null)

    try {
      const [appRes, tlRes] = await Promise.all([
        apiClient.get<ApplicationDetail>(`/v1/applications/${id}`),
        apiClient.get<TimelineEvent[]>(`/v1/applications/${id}/timeline`).catch(() => ({ data: [] as TimelineEvent[] })),
      ])
      setApplication(appRes.data)
      setTimeline(Array.isArray(tlRes.data) ? tlRes.data : [])
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load application'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  /* ── Loading / error states ────────────────────────────────────────────── */

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <LoadingSpinner size="lg" label="Loading application…" />
      </div>
    )
  }

  if (error || !application) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12">
        <PageHeader
          title="Application Not Found"
          breadcrumbs={[
            { label: 'Applications', href: '/staff/applications' },
            { label: id ?? '…' },
          ]}
        />
        <SectionCard>
          <p className="text-rust">{error ?? 'The requested application could not be loaded.'}</p>
          <button
            onClick={() => navigate('/staff/applications')}
            className="mt-4 rounded-md bg-soil px-4 py-2 text-sm font-medium text-cream transition-colors hover:bg-bark"
          >
            Back to Queue
          </button>
        </SectionCard>
      </div>
    )
  }

  /* ── Derived data ──────────────────────────────────────────────────────── */

  const status = application.status
  const projectTitle = getProjectTitle(application)

  /* ── Action buttons per status ─────────────────────────────────────────── */

  const actions: { label: string; href: string; variant: 'primary' | 'secondary' }[] = []

  if (status === 'submitted' || status === 'screening') {
    actions.push({ label: 'Begin Screening', href: `/staff/screening/${id}`, variant: 'primary' })
  }
  if (status === 'eligible' || status === 'under_review') {
    actions.push({ label: 'Review Queue', href: '/staff/review-queue', variant: 'primary' })
  }
  if (status === 'reviewed' || status === 'review_complete') {
    actions.push({ label: 'Make Decision', href: `/staff/awards/${id}/decision`, variant: 'primary' })
  }
  if (status === 'approved') {
    actions.push({ label: 'Send Agreement', href: `/staff/awards/${id}/agreement`, variant: 'primary' })
  }

  // Messages link is always available
  actions.push({ label: 'Messages', href: `/staff/messages/${id}`, variant: 'secondary' })

  const btnBase =
    'inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-clay/50'
  const btnPrimary = 'bg-soil text-cream hover:bg-bark'
  const btnSecondary = 'border border-sand bg-parchment text-bark hover:bg-sand/30'

  /* ── Render ────────────────────────────────────────────────────────────── */

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 md:py-8">
      <PageHeader
        title="Application Management"
        breadcrumbs={[
          { label: 'Applications', href: '/staff/applications' },
          { label: application.reference_number },
        ]}
        action={
          <div className="flex flex-wrap gap-2">
            {actions.map((a) => (
              <button
                key={a.href}
                onClick={() => navigate(a.href)}
                className={cn(btnBase, a.variant === 'primary' ? btnPrimary : btnSecondary)}
              >
                {a.label}
              </button>
            ))}
          </div>
        }
      />

      {/* ── Application Details ────────────────────────────────────────────── */}
      <div className="space-y-6">
        <SectionCard title="Application Details">
          <dl className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
            <div>
              <dt className="font-mono text-xs uppercase tracking-wide text-clay">Reference</dt>
              <dd className="mt-1 text-sm font-medium text-soil">{application.reference_number}</dd>
            </div>
            <div>
              <dt className="font-mono text-xs uppercase tracking-wide text-clay">Programme</dt>
              <dd className="mt-1 text-sm font-medium text-soil">{application.programme_name}</dd>
            </div>
            <div>
              <dt className="font-mono text-xs uppercase tracking-wide text-clay">Project / Applicant</dt>
              <dd className="mt-1 text-sm font-medium text-soil">{projectTitle}</dd>
            </div>
            <div>
              <dt className="font-mono text-xs uppercase tracking-wide text-clay">Status</dt>
              <dd className="mt-1">
                <StatusPill status={status} />
              </dd>
            </div>
            {application.current_stage && (
              <div>
                <dt className="font-mono text-xs uppercase tracking-wide text-clay">Current Stage</dt>
                <dd className="mt-1 text-sm font-medium text-soil">
                  {humaniseEvent(application.current_stage)}
                </dd>
              </div>
            )}
            <div>
              <dt className="font-mono text-xs uppercase tracking-wide text-clay">Submitted</dt>
              <dd className="mt-1 text-sm text-bark">
                {application.submitted_at ? formatDateTime(application.submitted_at) : '—'}
              </dd>
            </div>
            <div>
              <dt className="font-mono text-xs uppercase tracking-wide text-clay">Last Updated</dt>
              <dd className="mt-1 text-sm text-bark">{formatDateTime(application.updated_at)}</dd>
            </div>
          </dl>
        </SectionCard>

        {/* ── Stage Timeline ───────────────────────────────────────────────── */}
        <SectionCard title="Timeline">
          {timeline.length === 0 ? (
            <p className="text-sm text-bark/60">No timeline events recorded yet.</p>
          ) : (
            <ol className="relative ml-3 border-l-2 border-sand/60">
              {timeline.map((evt, idx) => (
                <li key={idx} className="mb-6 ml-6 last:mb-0">
                  {/* Dot */}
                  <span
                    className={cn(
                      'absolute -left-[9px] flex h-4 w-4 items-center justify-center rounded-full ring-4 ring-parchment',
                      eventDotColor(evt.event),
                    )}
                  />

                  <div className="flex flex-col gap-0.5">
                    <h4 className="text-sm font-semibold text-soil">
                      {humaniseEvent(evt.event)}
                    </h4>
                    <time className="font-mono text-xs text-clay">
                      {formatDateTime(evt.timestamp)}
                    </time>
                    {evt.actor && (
                      <span className="text-xs text-bark">by {evt.actor}</span>
                    )}
                    {evt.detail && (
                      <p className="mt-1 text-sm text-bark/80">{evt.detail}</p>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </SectionCard>

        {/* ── Quick Actions (mobile-friendly duplicate) ────────────────────── */}
        <SectionCard title="Actions">
          <div className="flex flex-wrap gap-3">
            {actions.map((a) => (
              <button
                key={a.href}
                onClick={() => navigate(a.href)}
                className={cn(btnBase, a.variant === 'primary' ? btnPrimary : btnSecondary)}
              >
                {a.label}
              </button>
            ))}
          </div>
        </SectionCard>
      </div>
    </div>
  )
}
