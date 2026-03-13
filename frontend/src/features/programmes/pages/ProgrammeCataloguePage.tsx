import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { listProgrammes } from '../api'
import type { ProgrammeListItem } from '../types'
import { LoadingSpinner } from '@/shared/components/LoadingSpinner'
import { PageHeader } from '@/shared/components/PageHeader'

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatInr(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount)
}

function formatWindow(opens: string | null, closes: string | null): string {
  if (!opens && !closes) return 'Announced soon'
  const fmt = (d: string) =>
    new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
  if (opens && closes) return `${fmt(opens)} – ${fmt(closes)}`
  if (opens) return `Opens ${fmt(opens)}`
  return `Closes ${fmt(closes!)}`
}

// ── Programme Card ────────────────────────────────────────────────────────────

const ACCENT_CLASSES = [
  'border-l-clay',
  'border-l-moss',
  'border-l-water',
]

function ProgrammeCard({ programme, index }: { programme: ProgrammeListItem; index: number }) {
  const accent = ACCENT_CLASSES[index % ACCENT_CLASSES.length]
  return (
    <article
      className={[
        'flex flex-col rounded-lg border border-sand bg-parchment shadow-card',
        'border-l-4', accent,
        'transition-shadow duration-200 hover:shadow-card-hover',
        'animate-slide-up',
      ].join(' ')}
      style={{ animationDelay: `${index * 80}ms`, animationFillMode: 'both' }}
    >
      {/* Header */}
      <div className="px-5 pt-5 pb-3 md:px-6 md:pt-6">
        <span className="inline-block rounded-pill bg-straw px-2.5 py-0.5 font-mono text-xs font-semibold uppercase tracking-wider text-clay mb-2">
          {programme.code}
        </span>
        <h2 className="font-heading text-lg font-bold text-soil leading-snug">
          {programme.name}
        </h2>
        {programme.purpose && (
          <p className="mt-2 font-body text-sm text-bark leading-relaxed line-clamp-3">
            {programme.purpose}
          </p>
        )}
      </div>

      {/* Metadata grid */}
      <div className="mx-5 md:mx-6 border-t border-straw/60 pt-3 pb-3 grid grid-cols-2 gap-x-4 gap-y-3">
        <div>
          <p className="font-mono text-xs uppercase tracking-wide text-sand mb-0.5">Funding Range</p>
          <p className="font-body text-sm font-semibold text-bark">
            {formatInr(programme.funding_min_inr)} – {formatInr(programme.funding_max_inr)}
          </p>
        </div>
        <div>
          <p className="font-mono text-xs uppercase tracking-wide text-sand mb-0.5">Duration</p>
          <p className="font-body text-sm font-semibold text-bark">
            {programme.duration_min_months}–{programme.duration_max_months} months
          </p>
        </div>
        <div className="col-span-2">
          <p className="font-mono text-xs uppercase tracking-wide text-sand mb-0.5">Application Window</p>
          <p className="font-body text-sm font-medium text-bark">
            {formatWindow(
              programme.application_window.opens,
              programme.application_window.closes,
            )}
          </p>
        </div>
      </div>

      {/* Scoring chips */}
      {programme.scoring_dimensions.length > 0 && (
        <div className="mx-5 md:mx-6 pb-3 flex flex-wrap gap-1.5">
          {programme.scoring_dimensions.map((d) => (
            <span
              key={d.dimension}
              className="rounded-pill bg-cream border border-straw px-2 py-0.5 font-mono text-xs text-bark"
              title={`${d.weight_pct}%`}
            >
              {d.dimension} · {d.weight_pct}%
            </span>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="mt-auto flex flex-col gap-2 px-5 pb-5 md:px-6 md:pb-6 pt-2 border-t border-straw/60">
        <Link
          to={`/programmes/${programme.id}`}
          className="btn-secondary text-center w-full"
        >
          View Details
        </Link>
        <Link
          to={`/eligibility-check?programme_id=${programme.id}`}
          className="btn-primary text-center w-full"
        >
          Check Eligibility
        </Link>
      </div>
    </article>
  )
}

// ── Floating eligibility panel ────────────────────────────────────────────────

function FloatingEligibilityPanel() {
  return (
    <div className="fixed bottom-6 right-4 left-4 sm:left-auto sm:right-6 sm:w-80 z-30 animate-slide-up">
      <div className="
        rounded-xl border border-clay/30 bg-soil/95 shadow-modal
        px-5 py-4 flex flex-col gap-3 backdrop-blur-sm
      ">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-clay/20">
            <svg className="h-4 w-4 text-straw" viewBox="0 0 20 20" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z"
                clipRule="evenodd"
              />
            </svg>
          </span>
          <div>
            <p className="font-heading text-sm font-semibold text-parchment leading-tight">
              Not sure which grant suits you?
            </p>
            <p className="mt-1 font-body text-xs text-sand leading-relaxed">
              Run a quick eligibility check across all programmes in under 30 seconds.
            </p>
          </div>
        </div>
        <Link to="/eligibility-check" className="btn-primary text-center w-full !bg-clay hover:!bg-bark">
          Run Eligibility Check →
        </Link>
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function ProgrammeCataloguePage() {
  const [programmes, setProgrammes] = useState<ProgrammeListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    listProgrammes()
      .then(setProgrammes)
      .catch(() => setError('Could not load programmes. Please try again.'))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="min-h-screen bg-cream px-4 py-8 md:px-8 md:py-12 pb-40">
      <div className="mx-auto max-w-6xl">
        <PageHeader
          title="Grant Programmes"
          action={
            <Link to="/eligibility-check" className="btn-secondary hidden sm:inline-flex">
              Check Eligibility
            </Link>
          }
        />

        {/* Intro */}
        <p className="mb-8 font-body text-base text-bark max-w-2xl">
          GrantFlow funds impactful initiatives across community development, education,
          and ecological conservation. Explore programmes below and check whether your
          organisation qualifies.
        </p>

        {/* States */}
        {loading && (
          <div className="flex justify-center py-24">
            <LoadingSpinner />
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-rust/30 bg-rust/10 px-5 py-4 text-center">
            <p className="font-body text-sm text-rust">{error}</p>
          </div>
        )}

        {!loading && !error && programmes.length === 0 && (
          <div className="rounded-lg border border-straw bg-parchment px-5 py-12 text-center">
            <p className="font-body text-sm text-bark">No active programmes at this time.</p>
          </div>
        )}

        {/* Card grid */}
        {!loading && !error && programmes.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {programmes.map((p, i) => (
              <ProgrammeCard key={p.id} programme={p} index={i} />
            ))}
          </div>
        )}
      </div>

      <FloatingEligibilityPanel />
    </div>
  )
}
