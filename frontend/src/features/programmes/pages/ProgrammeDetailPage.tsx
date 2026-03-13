import { useState, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { getProgramme } from '../api'
import type { ProgrammeDetail } from '../types'
import { SectionCard } from '@/shared/components/SectionCard'
import { DataTable } from '@/shared/components/DataTable'
import { PageHeader } from '@/shared/components/PageHeader'
import { LoadingSpinner } from '@/shared/components/LoadingSpinner'
import { useAuthStore } from '@/store/authStore'

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatInr(amount: number | null): string {
  if (amount === null) return '—'
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount)
}

function formatDate(d: string | null | undefined): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

// ── Scoring dimension bar ─────────────────────────────────────────────────────

const BAR_COLORS = [
  'bg-clay',
  'bg-moss',
  'bg-water',
  'bg-amber',
]

function ScoringRubric({ programme }: { programme: ProgrammeDetail }) {
  return (
    <div className="flex flex-col gap-4">
      {programme.scoring_dimensions.map((d, i) => (
        <div key={d.dimension}>
          <div className="flex items-center justify-between mb-1.5">
            <span className="font-body text-sm font-medium text-bark">{d.dimension}</span>
            <span className="font-mono text-sm font-bold text-soil">{d.weight_pct}%</span>
          </div>
          <div className="h-2.5 w-full rounded-full bg-straw overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-700 ${BAR_COLORS[i % BAR_COLORS.length]}`}
              style={{ width: `${d.weight_pct}%` }}
            />
          </div>
        </div>
      ))}
      <p className="font-body text-xs text-sand mt-1">
        Dimensions total 100 % — scores are weighted accordingly during review.
      </p>
    </div>
  )
}

// ── Disbursement timeline ─────────────────────────────────────────────────────

function DisbursementTimeline({ programme }: { programme: ProgrammeDetail }) {
  return (
    <ol className="relative border-l-2 border-straw ml-3 flex flex-col gap-0">
      {programme.disbursement_schedule.map((m, i) => (
        <li key={i} className="pl-6 pb-6 relative last:pb-0">
          {/* dot */}
          <span className="absolute -left-[9px] top-0.5 h-4 w-4 rounded-full bg-clay border-2 border-parchment" />
          <p className="font-body text-sm font-semibold text-bark leading-tight">{m.milestone}</p>
          <p className="font-mono text-xs text-clay mt-0.5 font-bold">{m.pct}% of total grant</p>
        </li>
      ))}
    </ol>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

type CriterionRow = {
  rule_code: string
  description: string
  requirement: string
}

export function ProgrammeDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const isLoggedIn = useAuthStore((s) => !!s.accessToken)

  const [programme, setProgramme] = useState<ProgrammeDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    getProgramme(id)
      .then(setProgramme)
      .catch(() => setError('Programme not found or could not be loaded.'))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-cream">
        <LoadingSpinner />
      </div>
    )
  }

  if (error || !programme) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-cream px-4">
        <p className="font-body text-sm text-rust">{error ?? 'Programme not found.'}</p>
        <button onClick={() => navigate(-1)} className="btn-secondary">
          ← Back
        </button>
      </div>
    )
  }

  const criteriaColumns: import('@/shared/components/DataTable').Column<CriterionRow>[] = [
    {
      key: 'rule_code',
      header: 'Rule',
      className: 'w-28',
      render: (row) => (
        <span className="rounded bg-straw px-1.5 py-0.5 font-mono text-xs text-clay font-semibold">
          {row.rule_code}
        </span>
      ),
    },
    { key: 'description', header: 'Criterion', sortable: true },
    {
      key: 'requirement',
      header: 'Requirement',
      render: (row) => (
        <span className="font-body text-sm text-soil">{row.requirement}</span>
      ),
    },
  ]

  return (
    <div className="min-h-screen bg-cream px-4 py-8 md:px-8 md:py-12">
      <div className="mx-auto max-w-4xl">
        <PageHeader
          title={programme.name}
          breadcrumbs={[
            { label: 'Programmes', href: '/' },
            { label: programme.code },
          ]}
          action={
            <Link to={`/eligibility-check?programme_id=${programme.id}`} className="btn-secondary">
              Check Eligibility
            </Link>
          }
        />

        {/* Code badge */}
        <span className="mb-6 inline-block rounded-pill bg-straw px-3 py-1 font-mono text-sm font-bold uppercase tracking-wider text-clay">
          {programme.code}
        </span>

        <div className="flex flex-col gap-6">
          {/* Overview */}
          <SectionCard title="Overview">
            <p className="font-body text-base text-bark leading-relaxed">
              {programme.purpose ?? 'No description available.'}
            </p>
          </SectionCard>

          {/* Funding & Duration */}
          <SectionCard title="Funding & Duration">
            <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3">
              <div>
                <p className="font-mono text-xs uppercase tracking-wide text-sand mb-1">Min Grant</p>
                <p className="font-heading text-lg font-bold text-soil">
                  {formatInr(Number(programme.funding_min_inr))}
                </p>
              </div>
              <div>
                <p className="font-mono text-xs uppercase tracking-wide text-sand mb-1">Max Grant</p>
                <p className="font-heading text-lg font-bold text-soil">
                  {formatInr(Number(programme.funding_max_inr))}
                </p>
              </div>
              <div>
                <p className="font-mono text-xs uppercase tracking-wide text-sand mb-1">Total Budget</p>
                <p className="font-heading text-lg font-bold text-soil">
                  {formatInr(programme.total_budget_inr ? Number(programme.total_budget_inr) : null)}
                </p>
              </div>
              <div>
                <p className="font-mono text-xs uppercase tracking-wide text-sand mb-1">Duration</p>
                <p className="font-body text-base font-semibold text-bark">
                  {programme.duration_min_months}–{programme.duration_max_months} months
                </p>
              </div>
              <div>
                <p className="font-mono text-xs uppercase tracking-wide text-sand mb-1">Awards / Cycle</p>
                <p className="font-body text-base font-semibold text-bark">
                  {programme.max_awards_per_cycle ?? '—'}
                </p>
              </div>
            </div>

            {(programme.application_window.opens || programme.application_window.closes) && (
              <div className="mt-6 p-4 rounded-lg bg-straw/40 border border-straw">
                <p className="font-mono text-xs uppercase tracking-wide text-sand mb-1">
                  Application Window
                </p>
                <p className="font-body text-base font-semibold text-bark">
                  {formatDate(programme.application_window.opens)} —{' '}
                  {formatDate(programme.application_window.closes)}
                </p>
              </div>
            )}
          </SectionCard>

          {/* Eligibility Criteria */}
          <SectionCard title="Eligibility Criteria" noPadding>
            <DataTable<CriterionRow>
              columns={criteriaColumns}
              data={programme.eligibility_criteria}
              keyExtractor={(r) => r.rule_code}
              emptyMessage="No eligibility criteria listed."
            />
          </SectionCard>

          {/* Scoring Rubric */}
          <SectionCard title="Scoring Rubric">
            <ScoringRubric programme={programme} />
          </SectionCard>

          {/* Disbursement Schedule */}
          <SectionCard title="Disbursement Schedule">
            <DisbursementTimeline programme={programme} />
          </SectionCard>

          {/* Apply CTA */}
          <div className="rounded-lg border border-clay/25 bg-parchment px-6 py-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-heading text-lg font-bold text-soil">
                Ready to apply?
              </p>
              <p className="font-body text-sm text-bark mt-1">
                {isLoggedIn
                  ? "Start your application for this programme now."
                  : "Create an account or sign in to begin your application."}
              </p>
            </div>
            <div className="flex gap-3 flex-shrink-0">
              {isLoggedIn ? (
                <Link
                  to={`/apply/${programme.id}`}
                  className="btn-primary"
                >
                  Apply Now →
                </Link>
              ) : (
                <>
                  <Link to="/login" className="btn-secondary">
                    Sign In
                  </Link>
                  <Link to="/register" className="btn-primary">
                    Create Account →
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
