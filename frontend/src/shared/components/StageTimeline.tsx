import { cn } from '@/shared/utils/cn'

/* ── Types ─────────────────────────────────────────────────────────────── */

export interface TimelineEvent {
  stage: string
  label: string
  occurred_at?: string | null
  is_current?: boolean
  sla_date?: string | null
}

interface StageTimelineProps {
  events: TimelineEvent[]
  className?: string
}

/* ── Component ─────────────────────────────────────────────────────────── */

export function StageTimeline({ events, className }: StageTimelineProps) {
  return (
    <div className={cn('relative', className)}>
      {events.map((evt, i) => {
        const isCompleted = !evt.is_current && evt.occurred_at != null
        const isCurrent = evt.is_current === true

        return (
          <div key={evt.stage} className="relative flex gap-4 pb-8 last:pb-0">
            {/* Vertical line */}
            {i < events.length - 1 && (
              <div
                className={cn(
                  'absolute left-[11px] top-6 h-full w-0.5',
                  isCompleted ? 'bg-moss' : 'bg-sand/40',
                )}
              />
            )}

            {/* Circle */}
            <div className="relative z-10 flex-shrink-0">
              <div
                className={cn(
                  'flex h-6 w-6 items-center justify-center rounded-full border-2',
                  isCompleted
                    ? 'border-moss bg-moss text-cream'
                    : isCurrent
                      ? 'border-clay bg-clay text-cream animate-pulse'
                      : 'border-sand/60 bg-cream text-sand',
                )}
              >
                {isCompleted ? (
                  <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                ) : (
                  <div
                    className={cn(
                      'h-2 w-2 rounded-full',
                      isCurrent ? 'bg-cream' : 'bg-sand/60',
                    )}
                  />
                )}
              </div>
            </div>

            {/* Content */}
            <div className="min-w-0 flex-1 pt-0.5">
              <p
                className={cn(
                  'font-heading text-sm font-semibold',
                  isCompleted
                    ? 'text-bark'
                    : isCurrent
                      ? 'text-soil'
                      : 'text-sand',
                )}
              >
                {evt.label}
              </p>

              {evt.occurred_at && (
                <p className="mt-0.5 font-body text-xs text-sand">
                  {new Date(evt.occurred_at).toLocaleDateString('en-IN', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                  })}
                </p>
              )}

              {isCurrent && evt.sla_date && (
                <p className="mt-1 rounded-md bg-amber/10 px-2 py-0.5 inline-block font-mono text-[10px] text-amber font-medium">
                  {evt.sla_date}
                </p>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
