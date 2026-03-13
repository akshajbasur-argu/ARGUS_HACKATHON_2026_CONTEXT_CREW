import { type ReactNode } from 'react'
import { cn } from '@/shared/utils/cn'

interface SectionCardProps {
  title?: string
  children: ReactNode
  className?: string
  noPadding?: boolean
}

export function SectionCard({ title, children, className, noPadding = false }: SectionCardProps) {
  return (
    <div
      className={cn(
        'overflow-hidden rounded-lg border border-sand bg-parchment shadow-card',
        'border-l-4 border-l-clay',
        className,
      )}
    >
      {title && (
        <div className="border-b border-straw px-5 py-3 md:px-6">
          <h3 className="font-heading text-base font-semibold text-bark">
            {title}
          </h3>
        </div>
      )}
      <div className={cn(!noPadding && 'px-5 py-4 md:px-6 md:py-5')}>
        {children}
      </div>
    </div>
  )
}
