import { cn } from '@/shared/utils/cn'

interface AIBadgeProps {
  label?: string
  className?: string
}

export function AIBadge({ label = 'AI Suggested', className }: AIBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-pill border border-amber/40 bg-amber/15 px-2 py-0.5',
        'font-mono text-[10px] font-semibold uppercase tracking-wider text-amber',
        className,
      )}
    >
      <svg className="h-3 w-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M8 1L10 5.5L15 6.5L11.5 10L12.5 15L8 12.5L3.5 15L4.5 10L1 6.5L6 5.5L8 1Z" />
      </svg>
      {label}
    </span>
  )
}
