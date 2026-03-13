import { useCallback, useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { apiClient } from '@/api/client'
import { PageHeader } from '@/shared/components/PageHeader'
import { SectionCard } from '@/shared/components/SectionCard'
import { AIBadge } from '@/shared/components/AIBadge'
import { LoadingSpinner } from '@/shared/components/LoadingSpinner'
import { cn } from '@/shared/utils/cn'

/* ── Types ─────────────────────────────────────────────────────────────── */

interface RiskFlag {
  type: string
  description: string
  severity: 'high' | 'medium' | 'low'
}

interface ScoreDim {
  dimension: string
  label: string
  weight: number
  ai_score: number | null
  human_score: number | null
  human_comment: string | null
}

interface AIScoreDetail {
  score: number
  justification: string
  source_section: string
}

interface ReviewPkg {
  id: string
  summary_text: string
  suggested_scores: Record<string, number>
  score_details: Record<string, AIScoreDetail> | null
  risk_flags: RiskFlag[]
  generated_at: string
}

interface DocItem {
  id: string
  doc_type: string
  filename: string
}

interface WorkspaceData {
  application_id: string
  reference_number: string
  programme_name: string
  programme_code: string
  applicant_name: string
  status: string
  form_data: Record<string, unknown>
  documents: DocItem[]
  assignment_id: string
  assigned_at: string
  completed_at: string | null
  package: ReviewPkg | null
  rubric: Array<{ dimension: string; label: string; weight: number }>
  existing_scores: ScoreDim[]
}

interface Annotation {
  id: string
  application_id: string
  reviewer_id: string
  text_selection: string
  section: string
  note: string
  created_at: string
}

/* ── Star selector ─────────────────────────────────────────────────────── */

function StarSelector({
  value,
  onChange,
  disabled,
}: {
  value: number | null
  onChange: (v: number) => void
  disabled: boolean
}) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          disabled={disabled}
          onClick={() => onChange(star)}
          className={cn(
            'h-6 w-6 transition-colors',
            disabled ? 'cursor-not-allowed' : 'cursor-pointer',
          )}
        >
          <svg viewBox="0 0 20 20" fill={value != null && star <= value ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5" className={cn(
            value != null && star <= value ? 'text-clay' : 'text-sand/50',
          )}>
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
          </svg>
        </button>
      ))}
    </div>
  )
}

/* ── AI Star display ───────────────────────────────────────────────────── */

function AIStars({ score }: { score: number | null }) {
  if (score == null) return <span className="text-xs text-sand">--</span>
  const rounded = Math.round(score)
  return (
    <div className="flex items-center gap-1">
      <div className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map((s) => (
          <svg key={s} className={cn('h-4 w-4', s <= rounded ? 'text-amber' : 'text-sand/30')} viewBox="0 0 20 20" fill="currentColor">
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
          </svg>
        ))}
      </div>
      <AIBadge label={`AI: ${score}`} />
    </div>
  )
}

/* ── Accordion section ─────────────────────────────────────────────────── */

function Accordion({
  title,
  children,
  defaultOpen = false,
}: {
  title: string
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border-b border-straw/50">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <span className="font-heading text-sm font-semibold text-bark">
          {title}
        </span>
        <svg
          className={cn('h-4 w-4 text-sand transition-transform', open && 'rotate-180')}
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  )
}

/* ── Component ─────────────────────────────────────────────────────────── */

export function ReviewWorkspace() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [data, setData] = useState<WorkspaceData | null>(null)
  const [loading, setLoading] = useState(true)
  const [scores, setScores] = useState<Record<string, { score: number | null; comment: string }>>({})
  const [saving, setSaving] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [annotations, setAnnotations] = useState<Annotation[]>([])
  const [annotationPopover, setAnnotationPopover] = useState<{
    x: number
    y: number
    text: string
    section: string
  } | null>(null)
  const [annotationNote, setAnnotationNote] = useState('')
  const [savingAnnotation, setSavingAnnotation] = useState(false)

  const isCompleted = data?.completed_at != null

  const fetchData = useCallback(async () => {
    if (!id) return
    setLoading(true)
    try {
      const res = await apiClient.get(`/v1/review/review/${id}`)
      setData(res.data)

      // Init scores from existing
      const init: Record<string, { score: number | null; comment: string }> = {}
      for (const s of res.data.existing_scores ?? []) {
        init[s.dimension] = {
          score: s.human_score != null ? Number(s.human_score) : null,
          comment: s.human_comment ?? '',
        }
      }
      setScores(init)
    } catch {
      /* empty */
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  /* ── Auto-save individual score ─────────────────────────────────── */
  async function saveScore(dimension: string, humanScore: number, comment: string) {
    if (!id || isCompleted) return
    setSaving(true)
    try {
      await apiClient.post(`/v1/review/review/${id}/scores`, {
        scores: [{ dimension, human_score: humanScore, comment: comment || undefined }],
      })
    } catch {
      /* empty */
    } finally {
      setSaving(false)
    }
  }

  function handleScoreChange(dimension: string, score: number) {
    const prev = scores[dimension] ?? { score: null, comment: '' }
    const updated = { ...prev, score }
    setScores((s) => ({ ...s, [dimension]: updated }))
    saveScore(dimension, score, updated.comment)
  }

  function handleCommentChange(dimension: string, comment: string) {
    setScores((s) => ({
      ...s,
      [dimension]: { ...s[dimension], comment },
    }))
  }

  function handleCommentBlur(dimension: string) {
    const entry = scores[dimension]
    if (entry?.score != null) {
      saveScore(dimension, entry.score, entry.comment)
    }
  }

  /* ── Submit review ──────────────────────────────────────────────── */
  async function submitReview() {
    if (!id) return
    setSubmitting(true)
    try {
      // Save all scores first
      const scoresToSave = Object.entries(scores)
        .filter(([, v]) => v.score != null)
        .map(([dim, v]) => ({
          dimension: dim,
          human_score: v.score!,
          comment: v.comment || undefined,
        }))

      if (scoresToSave.length > 0) {
        await apiClient.post(`/v1/review/review/${id}/scores`, { scores: scoresToSave })
      }

      await apiClient.post(`/v1/review/review/${id}/submit`)
      await fetchData()
    } catch {
      /* empty */
    } finally {
      setSubmitting(false)
    }
  }

  /* ── Composite score ────────────────────────────────────────────── */
  function computeComposite(): number | null {
    if (!data) return null
    let totalWeight = 0
    let weightedSum = 0
    for (const dim of data.rubric) {
      const entry = scores[dim.dimension]
      if (entry?.score == null) return null
      weightedSum += entry.score * dim.weight
      totalWeight += dim.weight
    }
    if (totalWeight === 0) return null
    return Math.round((weightedSum / totalWeight) * 100) / 100
  }

  /* ── Annotations ─────────────────────────────────────────────────── */
  const fetchAnnotations = useCallback(async () => {
    if (!id) return
    try {
      const res = await apiClient.get(`/v1/review/review/${id}/annotations`)
      setAnnotations(res.data)
    } catch {
      /* empty */
    }
  }, [id])

  useEffect(() => {
    fetchAnnotations()
  }, [fetchAnnotations])

  async function saveAnnotation() {
    if (!id || !annotationPopover || !annotationNote.trim()) return
    setSavingAnnotation(true)
    try {
      await apiClient.post(`/v1/review/review/${id}/annotations`, {
        text_selection: annotationPopover.text,
        section: annotationPopover.section,
        note: annotationNote.trim(),
      })
      setAnnotationPopover(null)
      setAnnotationNote('')
      await fetchAnnotations()
    } catch {
      /* empty */
    } finally {
      setSavingAnnotation(false)
    }
  }

  function handleTextSelect(section: string) {
    const selection = window.getSelection()
    if (!selection || selection.isCollapsed || !selection.toString().trim()) return
    const text = selection.toString().trim()
    if (text.length < 3) return

    const range = selection.getRangeAt(0)
    const rect = range.getBoundingClientRect()
    setAnnotationPopover({
      x: rect.left + rect.width / 2,
      y: rect.top - 10,
      text,
      section,
    })
    setAnnotationNote('')
  }

  const allScored = data?.rubric.every((r) => scores[r.dimension]?.score != null) ?? false
  const composite = computeComposite()

  /* ── Loading / not found ─────────────────────────────────────────── */
  if (loading) {
    return (
      <div className="flex h-60 items-center justify-center">
        <LoadingSpinner label="Loading review workspace..." />
      </div>
    )
  }

  if (!data) {
    return (
      <div className="py-20 text-center">
        <p className="font-heading text-lg text-bark">Review not found</p>
        <button
          onClick={() => navigate('/reviewer/queue')}
          className="mt-4 font-body text-sm text-clay hover:underline"
        >
          Back to Queue
        </button>
      </div>
    )
  }

  const fd = data.form_data
  const budget = (fd.budget_breakdown ?? {}) as Record<string, unknown>

  /* ── Render ──────────────────────────────────────────────────────── */
  return (
    <div>
      <PageHeader
        title={`Review — ${data.reference_number}`}
        breadcrumbs={[
          { label: 'Review Queue', href: '/reviewer/queue' },
          { label: data.reference_number },
        ]}
        action={
          isCompleted ? (
            <span className="inline-flex items-center gap-1 rounded-pill bg-moss/15 px-3 py-1 font-mono text-xs font-semibold text-moss">
              Review Completed
            </span>
          ) : undefined
        }
      />

      {/* Desktop: 60/40 split, Mobile: stacked */}
      <div className="grid gap-6 lg:grid-cols-5">
        {/* ── Left: Application content (60%) ────────────────────── */}
        <div className="space-y-4 lg:col-span-3">
          <div className="rounded-lg border border-sand bg-parchment overflow-hidden">
            <Accordion title="Project Details" defaultOpen>
              <dl className="space-y-3" onMouseUp={() => handleTextSelect('Project Details')}>
                {[
                  ['Project Title', fd.project_title],
                  ['Problem Statement', fd.problem_statement],
                  ['Proposed Solution', fd.proposed_solution],
                  ['Expected Outcomes', fd.expected_outcomes],
                  ['Target Beneficiaries', fd.target_beneficiaries],
                ].map(([label, value]) => (
                  <div key={String(label)}>
                    <dt className="font-body text-xs text-sand">{String(label)}</dt>
                    <dd className="mt-0.5 font-body text-sm text-soil whitespace-pre-wrap">
                      {value ? String(value) : '—'}
                    </dd>
                  </div>
                ))}
              </dl>
            </Accordion>

            <Accordion title="Team & Sustainability">
              <dl className="space-y-3" onMouseUp={() => handleTextSelect('Team & Sustainability')}>
                <div>
                  <dt className="font-body text-xs text-sand">Team Description</dt>
                  <dd className="mt-0.5 font-body text-sm text-soil whitespace-pre-wrap">
                    {fd.team_description ? String(fd.team_description) : '—'}
                  </dd>
                </div>
                <div>
                  <dt className="font-body text-xs text-sand">Sustainability Plan</dt>
                  <dd className="mt-0.5 font-body text-sm text-soil whitespace-pre-wrap">
                    {fd.sustainability_plan ? String(fd.sustainability_plan) : '—'}
                  </dd>
                </div>
              </dl>
            </Accordion>

            <Accordion title="Budget Breakdown">
              <table className="w-full text-left font-body text-sm">
                <tbody>
                  {Object.entries(budget).map(([k, v]) => (
                    <tr key={k} className="border-b border-straw/40">
                      <td className="py-1.5 text-bark capitalize">{k}</td>
                      <td className="py-1.5 text-right font-mono text-soil">
                        {typeof v === 'number' ? `₹${v.toLocaleString('en-IN')}` : String(v ?? '—')}
                      </td>
                    </tr>
                  ))}
                  <tr className="font-semibold">
                    <td className="pt-2 text-bark">Total</td>
                    <td className="pt-2 text-right font-mono text-soil">
                      ₹{Number(fd.budget_total ?? 0).toLocaleString('en-IN')}
                    </td>
                  </tr>
                </tbody>
              </table>
            </Accordion>

            <Accordion title={`Documents (${data.documents.length})`}>
              {data.documents.length > 0 ? (
                <ul className="space-y-2">
                  {data.documents.map((doc) => (
                    <li key={doc.id} className="flex items-center gap-2 font-body text-sm">
                      <svg className="h-4 w-4 text-clay" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
                      </svg>
                      <a
                        href={`/api/v1/documents/${doc.id}/download`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-clay hover:underline"
                      >
                        {doc.filename}
                      </a>
                      <span className="font-mono text-[10px] text-sand">{doc.doc_type}</span>
                      <a
                        href={`/api/v1/documents/${doc.id}/download`}
                        download
                        className="ml-auto flex items-center gap-1 rounded-md bg-clay/10 px-2 py-0.5 font-mono text-[10px] text-clay hover:bg-clay/20"
                      >
                        <svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                        Download
                      </a>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="font-body text-sm text-sand">No documents attached.</p>
              )}
            </Accordion>
          </div>
        </div>

        {/* ── Right: AI Package + Scoring (40%) ──────────────────── */}
        <div className="space-y-4 lg:col-span-2">
          {/* AI Summary */}
          {data.package && (
            <SectionCard title="AI Review Package">
              <div className="mb-2">
                <AIBadge label="AI Generated Summary" />
              </div>
              <p className="font-body text-sm text-bark leading-relaxed whitespace-pre-wrap">
                {data.package.summary_text}
              </p>
            </SectionCard>
          )}

          {/* Scoring Sheet */}
          <SectionCard title="Scoring Sheet">
            <div className="space-y-4">
              {data.rubric.map((dim) => {
                const entry = scores[dim.dimension] ?? { score: null, comment: '' }
                const aiScore = data.package?.suggested_scores?.[dim.dimension] ?? null
                const aiDetail = data.package?.score_details?.[dim.dimension] ?? null

                return (
                  <div
                    key={dim.dimension}
                    className="rounded-lg border border-straw/50 bg-cream p-3"
                  >
                    {/* Dimension header */}
                    <div className="mb-2 flex items-center justify-between">
                      <div>
                        <span className="font-heading text-sm font-semibold text-bark">
                          {dim.label}
                        </span>
                        <span className="ml-2 font-mono text-[10px] text-sand">
                          {dim.weight}%
                        </span>
                      </div>
                    </div>

                    {/* AI score */}
                    <div className="mb-2">
                      <AIStars score={aiScore} />
                    </div>

                    {/* AI justification & source section */}
                    {aiDetail && (
                      <div className="mb-2 rounded-md border border-amber/20 bg-amber/5 px-2.5 py-2">
                        <p className="font-body text-xs text-bark leading-relaxed">
                          {aiDetail.justification}
                        </p>
                        {aiDetail.source_section && (
                          <p className="mt-1 font-mono text-[10px] text-sand">
                            Source: {aiDetail.source_section}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Human score */}
                    <div className="mb-2">
                      <span className="font-body text-xs text-sand">Your Score</span>
                      <StarSelector
                        value={entry.score}
                        onChange={(v) => handleScoreChange(dim.dimension, v)}
                        disabled={isCompleted}
                      />
                    </div>

                    {/* Comment */}
                    {(entry.score != null &&
                      aiScore != null &&
                      entry.score !== Math.round(aiScore)) || entry.comment ? (
                      <div>
                        <label className="font-body text-xs text-sand">
                          Comment{' '}
                          {entry.score != null &&
                            aiScore != null &&
                            entry.score !== Math.round(aiScore) && (
                              <span className="text-rust">*required (override)</span>
                            )}
                        </label>
                        <textarea
                          value={entry.comment}
                          onChange={(e) => handleCommentChange(dim.dimension, e.target.value)}
                          onBlur={() => handleCommentBlur(dim.dimension)}
                          disabled={isCompleted}
                          rows={2}
                          className="mt-1 w-full rounded-md border border-sand bg-parchment px-2 py-1.5 font-body text-xs text-soil placeholder:text-sand/60 focus:border-clay focus:outline-none focus:ring-[2px] focus:ring-clay/30"
                          placeholder="Explain your score..."
                        />
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </div>

            {/* Composite score */}
            <div className="mt-4 rounded-lg bg-soil/5 px-4 py-3">
              <div className="flex items-center justify-between">
                <span className="font-heading text-sm font-semibold text-bark">
                  Composite Score
                </span>
                <span className="font-mono text-lg font-bold text-soil">
                  {composite != null ? composite.toFixed(2) : '—'}
                </span>
              </div>
              <p className="mt-0.5 font-body text-[10px] text-sand">
                Weighted average across all dimensions
              </p>
            </div>

            {/* Actions */}
            {!isCompleted && (
              <div className="mt-4 flex gap-2">
                <button
                  onClick={() => navigate('/reviewer/queue')}
                  className="flex-1 rounded-lg border border-sand px-4 py-2.5 font-heading text-sm font-medium text-bark transition-colors hover:bg-parchment"
                >
                  Save & Return
                </button>
                <button
                  onClick={submitReview}
                  disabled={!allScored || submitting}
                  className="flex-1 rounded-lg bg-moss px-4 py-2.5 font-heading text-sm font-semibold text-cream transition-colors hover:bg-moss/90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {submitting ? 'Submitting...' : 'Submit Review'}
                </button>
              </div>
            )}

            {saving && (
              <p className="mt-2 text-center font-mono text-[10px] text-sand">
                Saving...
              </p>
            )}
          </SectionCard>

          {/* Your Annotations */}
          {annotations.length > 0 && (
            <SectionCard title="Your Annotations">
              <div className="space-y-3">
                {annotations.map((ann) => (
                  <div key={ann.id} className="rounded-md border border-straw/50 overflow-hidden">
                    <div className="bg-straw/20 px-3 py-1.5">
                      <p className="font-body text-xs text-bark italic line-clamp-2">
                        "{ann.text_selection}"
                      </p>
                    </div>
                    <div className="px-3 py-2">
                      <p className="font-body text-sm text-soil">{ann.note}</p>
                      <p className="mt-1 font-mono text-[10px] text-sand">
                        {ann.section}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}

          {/* Risk Flags */}
          {data.package && data.package.risk_flags.length > 0 && (
            <SectionCard title="Risk Flags">
              <ul className="space-y-2">
                {data.package.risk_flags.map((flag, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2 rounded-md bg-cream px-3 py-2"
                  >
                    <span
                      className={cn(
                        'mt-0.5 inline-block h-2 w-2 flex-shrink-0 rounded-full',
                        flag.severity === 'high'
                          ? 'bg-rust'
                          : flag.severity === 'medium'
                            ? 'bg-amber'
                            : 'bg-sand',
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="font-body text-sm text-bark">
                        {flag.description}
                      </p>
                      <p className="font-mono text-[10px] uppercase text-sand">
                        {flag.severity} &middot; {flag.type}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </SectionCard>
          )}
        </div>
      </div>

      {/* Annotation popover */}
      {annotationPopover && (
        <div
          className="fixed z-50 w-72 rounded-lg border border-sand bg-white shadow-lg"
          style={{
            left: Math.min(annotationPopover.x - 144, window.innerWidth - 300),
            top: annotationPopover.y - 180,
          }}
        >
          <div className="border-b border-straw px-3 py-2">
            <p className="font-body text-xs text-sand">Selected text:</p>
            <p className="mt-0.5 font-body text-xs text-bark italic line-clamp-2">
              "{annotationPopover.text}"
            </p>
          </div>
          <div className="p-3">
            <textarea
              value={annotationNote}
              onChange={(e) => setAnnotationNote(e.target.value)}
              placeholder="Add your note..."
              rows={3}
              className="w-full rounded-md border border-sand bg-parchment px-2 py-1.5 font-body text-xs text-soil placeholder:text-sand/60 focus:border-clay focus:outline-none focus:ring-[2px] focus:ring-clay/30"
              autoFocus
            />
            <div className="mt-2 flex gap-2">
              <button
                onClick={() => setAnnotationPopover(null)}
                className="flex-1 rounded-md border border-sand px-2 py-1.5 font-heading text-xs text-bark hover:bg-parchment"
              >
                Cancel
              </button>
              <button
                onClick={saveAnnotation}
                disabled={!annotationNote.trim() || savingAnnotation}
                className="flex-1 rounded-md bg-moss px-2 py-1.5 font-heading text-xs font-semibold text-cream hover:bg-moss/90 disabled:opacity-50"
              >
                {savingAnnotation ? 'Saving...' : 'Save Note'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
