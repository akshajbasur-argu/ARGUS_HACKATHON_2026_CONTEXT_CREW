import { cn } from '@/shared/utils/cn'

const STATUS_STYLES: Record<string, string> = {
  submitted:              'bg-sand/20 text-soil border-sand',
  screening:              'bg-straw/30 text-bark border-straw',
  eligible:               'bg-sage/20 text-moss border-sage',
  ineligible:             'bg-rust/15 text-rust border-rust/40',
  under_review:           'bg-water/15 text-water border-water/40',
  review_complete:        'bg-water/25 text-water border-water/50',
  approved:               'bg-moss/15 text-moss border-moss/40',
  rejected:               'bg-rust/15 text-rust border-rust/40',
  waitlisted:             'bg-amber/15 text-amber border-amber/40',
  agreement_sent:         'bg-gold/15 text-bark border-gold/40',
  agreement_acknowledged: 'bg-gold/20 text-bark border-gold/50',
  active:                 'bg-moss/15 text-moss border-moss/40',
  report_due:             'bg-amber/20 text-amber border-amber/40',
  closed:                 'bg-soil/10 text-soil border-soil/20',
}

const LABELS: Record<string, string> = {
  submitted:              'Submitted',
  screening:              'Screening',
  eligible:               'Eligible',
  ineligible:             'Ineligible',
  under_review:           'Under Review',
  review_complete:        'Review Complete',
  approved:               'Approved',
  rejected:               'Rejected',
  waitlisted:             'Waitlisted',
  agreement_sent:         'Agreement Sent',
  agreement_acknowledged: 'Agreement Acknowledged',
  active:                 'Active',
  report_due:             'Report Due',
  closed:                 'Closed',
}

interface StatusPillProps {
  status: string
  className?: string
}

export function StatusPill({ status, className }: StatusPillProps) {
  const style = STATUS_STYLES[status] ?? 'bg-sand/20 text-soil border-sand'
  const label = LABELS[status] ?? status.replace(/_/g, ' ')

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-pill border px-2.5 py-0.5',
        'font-mono text-xs font-medium tracking-wide uppercase',
        style,
        className,
      )}
    >
      {label}
    </span>
  )
}
