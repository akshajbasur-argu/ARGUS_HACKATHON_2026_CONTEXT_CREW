import { cn } from '@/shared/utils/cn'

interface StageBadgeProps {
  stage: number
  label: string
  active?: boolean
  className?: string
}

export function StageBadge({ stage, label, active = false, className }: StageBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 rounded-pill border px-3 py-1',
        'font-mono text-xs font-medium tracking-wide',
        active
          ? 'border-clay bg-clay text-cream'
          : 'border-sand bg-parchment text-bark',
        className,
      )}
    >
      <span
        className={cn(
          'flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold',
          active
            ? 'bg-cream text-clay'
            : 'bg-sand/50 text-soil',
        )}
      >
        {stage}
      </span>
      {label}
    </span>
  )
}
