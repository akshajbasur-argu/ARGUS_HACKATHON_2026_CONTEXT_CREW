import { useCallback, useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { apiClient } from '@/api/client'
import { PageHeader } from '@/shared/components/PageHeader'
import { SectionCard } from '@/shared/components/SectionCard'
import { StatusPill } from '@/shared/components/StatusPill'
import { LoadingSpinner } from '@/shared/components/LoadingSpinner'
import { StageTimeline, type TimelineEvent } from '@/shared/components/StageTimeline'
import { formatDate, formatDateTime } from '@/shared/utils/formatDate'
import { cn } from '@/shared/utils/cn'
import { MessagesPage } from '@/features/messaging/pages/MessagesPage'

/* ── Types ─────────────────────────────────────────────────────────────── */

interface DocumentItem {
  id: string
  doc_type: string
  filename: string
  uploaded_at: string
}

interface ApplicationData {
  id: string
  reference_number: string
  programme_id: string
  programme_name: string
  applicant_id: string
  status: string
  form_data: Record<string, unknown>
  submitted_at: string
  updated_at: string
  documents: DocumentItem[]
}

type TabKey = 'overview' | 'documents' | 'messages' | 'reports'

const TABS: { key: TabKey; label: string; showWhen?: string[] }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'documents', label: 'Documents' },
  { key: 'messages', label: 'Messages' },
  { key: 'reports', label: 'Reports', showWhen: ['active', 'report_due', 'closed'] },
]

const DOC_TYPE_LABELS: Record<string, string> = {
  registration_certificate: 'Registration Certificate',
  audited_financials_y1: 'Audited Financials (Year 1)',
  audited_financials_y2: 'Audited Financials (Year 2)',
  '80g_12a_certificate': '80G / 12A Certificate',
  fcra_certificate: 'FCRA Certificate',
}

const BUDGET_LABELS: Record<string, string> = {
  personnel: 'Personnel',
  equipment: 'Equipment',
  travel: 'Travel',
  overheads: 'Overheads',
  other: 'Other',
}

/* ── Helper ────────────────────────────────────────────────────────────── */

function formatINR(value: unknown): string {
  const num = Number(value)
  if (Number.isNaN(num)) return '—'
  return `₹${num.toLocaleString('en-IN')}`
}

function Field({ label, value }: { label: string; value: unknown }) {
  const display =
    value === null || value === undefined || value === ''
      ? '—'
      : String(value)
  return (
    <div>
      <dt className="font-body text-xs text-sand">{label}</dt>
      <dd className="mt-0.5 font-body text-sm text-soil whitespace-pre-wrap">
        {display}
      </dd>
    </div>
  )
}

/* ── Component ─────────────────────────────────────────────────────────── */

export function ApplicationDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [app, setApp] = useState<ApplicationData | null>(null)
  const [timeline, setTimeline] = useState<TimelineEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<TabKey>('overview')
  const [agreement, setAgreement] = useState<{
    id: string
    html_content: string
    status: string
    acknowledged_at: string | null
  } | null>(null)
  const [ackChecked, setAckChecked] = useState(false)
  const [acknowledging, setAcknowledging] = useState(false)
  const [ackSuccess, setAckSuccess] = useState(false)

  const fetchData = useCallback(async () => {
    if (!id) return
    setLoading(true)
    try {
      const [appRes, tlRes] = await Promise.all([
        apiClient.get(`/v1/applications/${id}`),
        apiClient.get(`/v1/applications/${id}/timeline`),
      ])
      setApp(appRes.data)
      setTimeline(tlRes.data.events ?? [])

      // Fetch agreement if status indicates one exists
      if (appRes.data.status === 'agreement_sent' || appRes.data.status === 'agreement_acknowledged') {
        try {
          const agreeRes = await apiClient.get(`/v1/awards/grantee/${id}/agreement`)
          setAgreement(agreeRes.data)
        } catch {
          /* agreement may not exist yet */
        }
      }
    } catch {
      /* empty — handled by empty state */
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  async function handleAcknowledge() {
    if (!id || !ackChecked) return
    setAcknowledging(true)
    try {
      await apiClient.post(`/v1/awards/grantee/${id}/acknowledge`)
      setAckSuccess(true)
      await fetchData()
    } catch {
      /* empty */
    } finally {
      setAcknowledging(false)
    }
  }

  /* ── Loading / not found ─────────────────────────────────────────── */

  if (loading) {
    return (
      <div className="flex h-60 items-center justify-center">
        <LoadingSpinner label="Loading application..." />
      </div>
    )
  }

  if (!app) {
    return (
      <div className="py-20 text-center">
        <p className="font-heading text-lg text-bark">Application not found</p>
        <button
          onClick={() => navigate('/dashboard')}
          className="mt-4 font-body text-sm text-clay hover:underline"
        >
          Back to Dashboard
        </button>
      </div>
    )
  }

  const fd = app.form_data
  const budget = (fd.budget_breakdown ?? {}) as Record<string, unknown>
  const budgetTotal = Object.values(budget).reduce<number>(
    (sum, v) => sum + (Number(v) || 0),
    0,
  )
  const visibleTabs = TABS.filter(
    (t) => !t.showWhen || t.showWhen.includes(app.status),
  )

  /* ── Render ──────────────────────────────────────────────────────── */
  return (
    <div>
      <PageHeader
        title={app.reference_number}
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: app.reference_number },
        ]}
        action={<StatusPill status={app.status} />}
      />

      {/* Tab bar */}
      <div className="mb-6 flex gap-1 border-b border-sand">
        {visibleTabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              'px-4 py-2.5 font-heading text-sm font-medium transition-colors',
              activeTab === tab.key
                ? 'border-b-2 border-clay text-clay'
                : 'text-sand hover:text-bark',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Overview tab ──────────────────────────────────────────── */}
      {activeTab === 'overview' && (
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Left column — application details */}
          <div className="space-y-6 lg:col-span-2">
            {/* Grant Agreement card — shown when agreement has been sent */}
            {(app.status === 'agreement_sent' || app.status === 'agreement_acknowledged') && (
              <SectionCard title="Grant Agreement">
                {ackSuccess || app.status === 'agreement_acknowledged' ? (
                  <div className="rounded-lg bg-moss/10 border border-moss/30 px-4 py-3">
                    <p className="font-body text-sm font-medium text-moss">
                      Agreement acknowledged. Inception tranche has been triggered.
                    </p>
                    {agreement?.acknowledged_at && (
                      <p className="mt-1 font-mono text-xs text-moss/70">
                        Acknowledged on {formatDateTime(agreement.acknowledged_at)}
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4">
                    {agreement?.html_content && (
                      <div className="max-h-96 overflow-y-auto rounded-lg border border-sand bg-white p-4">
                        <div
                          dangerouslySetInnerHTML={{ __html: agreement.html_content }}
                          className="font-body text-sm text-soil"
                        />
                      </div>
                    )}

                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={ackChecked}
                        onChange={(e) => setAckChecked(e.target.checked)}
                        className="mt-0.5 h-4 w-4 rounded border-sand text-moss focus:ring-moss/30"
                      />
                      <span className="font-body text-sm text-bark">
                        I have read and accept this agreement
                      </span>
                    </label>

                    <button
                      onClick={handleAcknowledge}
                      disabled={!ackChecked || acknowledging}
                      className="rounded-lg bg-moss px-5 py-2.5 font-heading text-sm font-semibold text-cream transition-colors hover:bg-moss/90 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {acknowledging ? 'Acknowledging...' : 'Acknowledge Agreement'}
                    </button>
                  </div>
                )}
              </SectionCard>
            )}

            {/* Meta */}
            <SectionCard title="Application Info">
              <dl className="grid gap-4 sm:grid-cols-2">
                <Field label="Programme" value={app.programme_name} />
                <Field label="Submitted" value={formatDateTime(app.submitted_at)} />
                <Field label="Last Updated" value={formatDateTime(app.updated_at)} />
                <Field label="Status" value={app.status.replace(/_/g, ' ')} />
              </dl>
            </SectionCard>

            {/* Project */}
            <SectionCard title="Project Details">
              <dl className="grid gap-4">
                <Field label="Project Title" value={fd.project_title} />
                <Field label="Problem Statement" value={fd.problem_statement} />
                <Field label="Proposed Solution" value={fd.proposed_solution} />
                <Field label="Expected Outcomes" value={fd.expected_outcomes} />
                <Field label="Target Beneficiaries" value={fd.target_beneficiaries} />
              </dl>
            </SectionCard>

            {/* Team */}
            <SectionCard title="Team & Sustainability">
              <dl className="grid gap-4">
                <Field label="Team Description" value={fd.team_description} />
                <Field label="Sustainability Plan" value={fd.sustainability_plan} />
              </dl>
            </SectionCard>

            {/* Budget */}
            <SectionCard title="Budget Breakdown">
              <div className="overflow-x-auto">
                <table className="w-full text-left font-body text-sm">
                  <thead>
                    <tr className="border-b border-straw text-xs text-sand">
                      <th className="pb-2 font-medium">Category</th>
                      <th className="pb-2 text-right font-medium">Amount (INR)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(BUDGET_LABELS).map(([key, label]) => (
                      <tr key={key} className="border-b border-straw/40">
                        <td className="py-2 text-bark">{label}</td>
                        <td className="py-2 text-right font-mono text-soil">
                          {formatINR(budget[key])}
                        </td>
                      </tr>
                    ))}
                    <tr className="font-semibold">
                      <td className="pt-3 text-bark">Total</td>
                      <td className="pt-3 text-right font-mono text-soil">
                        {formatINR(budgetTotal)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              {fd.budget_total != null && (
                <p className="mt-2 font-mono text-xs text-sand">
                  Declared total: {formatINR(fd.budget_total)}
                </p>
              )}
            </SectionCard>
          </div>

          {/* Right column — timeline */}
          <div className="space-y-6">
            <SectionCard title="Stage Timeline">
              {timeline.length > 0 ? (
                <StageTimeline events={timeline} />
              ) : (
                <p className="font-body text-sm text-sand">
                  Timeline not available.
                </p>
              )}
            </SectionCard>

            {/* Quick info */}
            <SectionCard title="Documents">
              {app.documents.length > 0 ? (
                <ul className="space-y-2">
                  {app.documents.map((doc) => (
                    <li
                      key={doc.id}
                      className="flex items-start gap-2 font-body text-sm"
                    >
                      <svg
                        className="mt-0.5 h-4 w-4 flex-shrink-0 text-clay"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                      >
                        <path
                          fillRule="evenodd"
                          d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z"
                          clipRule="evenodd"
                        />
                      </svg>
                      <div className="min-w-0">
                        <p className="truncate text-bark">{doc.filename}</p>
                        <p className="text-xs text-sand">
                          {DOC_TYPE_LABELS[doc.doc_type] ?? doc.doc_type} &middot;{' '}
                          {formatDate(doc.uploaded_at)}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="font-body text-sm text-sand">
                  No documents attached.
                </p>
              )}
            </SectionCard>
          </div>
        </div>
      )}

      {/* ── Documents tab ─────────────────────────────────────────── */}
      {activeTab === 'documents' && (
        <SectionCard title="Attached Documents">
          {app.documents.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {app.documents.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center gap-3 rounded-lg border border-sand bg-cream p-4"
                >
                  <svg
                    className="h-8 w-8 flex-shrink-0 text-clay"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-body text-sm font-medium text-bark">
                      {doc.filename}
                    </p>
                    <p className="font-body text-xs text-sand">
                      {DOC_TYPE_LABELS[doc.doc_type] ?? doc.doc_type}
                    </p>
                    <p className="font-mono text-[10px] text-sand/70">
                      Uploaded {formatDate(doc.uploaded_at)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="py-8 text-center font-body text-sm text-sand">
              No documents have been attached to this application.
            </p>
          )}
        </SectionCard>
      )}

      {/* ── Messages tab ────────────────────────────────────────── */}
      {activeTab === 'messages' && (
        <MessagesPage appId={app.id} />
      )}

      {/* ── Reports tab (active grants only) ──────────────────────── */}
      {activeTab === 'reports' && (
        <SectionCard title="Progress Reports">
          <div className="py-12 text-center">
            <svg
              className="mx-auto h-10 w-10 text-sand/50"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" />
              <path
                fillRule="evenodd"
                d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z"
                clipRule="evenodd"
              />
            </svg>
            <p className="mt-3 font-body text-sm text-sand">
              Progress reports will be available once the grant is active.
            </p>
          </div>
        </SectionCard>
      )}
    </div>
  )
}
