import { type ReactNode } from 'react'
import { cn } from '@/shared/utils/cn'

interface BreadcrumbItem {
  label: string
  href?: string
}

interface PageHeaderProps {
  title: string
  breadcrumbs?: BreadcrumbItem[]
  action?: ReactNode
  className?: string
}

export function PageHeader({ title, breadcrumbs, action, className }: PageHeaderProps) {
  return (
    <div className={cn('mb-6 md:mb-8', className)}>
      {/* Breadcrumbs */}
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav className="mb-2 flex items-center gap-1.5 font-mono text-xs text-sand">
          {breadcrumbs.map((crumb, i) => (
            <span key={i} className="flex items-center gap-1.5">
              {i > 0 && (
                <svg className="h-3 w-3 text-sand/60" viewBox="0 0 12 12" fill="currentColor">
                  <path d="M4.5 2L8.5 6L4.5 10" stroke="currentColor" strokeWidth="1.5" fill="none" />
                </svg>
              )}
              {crumb.href ? (
                <a
                  href={crumb.href}
                  className="text-clay transition-colors hover:text-bark hover:underline"
                >
                  {crumb.label}
                </a>
              ) : (
                <span className="text-bark">{crumb.label}</span>
              )}
            </span>
          ))}
        </nav>
      )}

      {/* Title + Action */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="font-heading text-2xl font-bold text-soil md:text-3xl">
          {title}
        </h1>
        {action && <div className="flex-shrink-0">{action}</div>}
      </div>
    </div>
  )
}
