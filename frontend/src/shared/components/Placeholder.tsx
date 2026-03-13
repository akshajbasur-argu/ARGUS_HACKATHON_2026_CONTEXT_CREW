import { PageHeader } from './PageHeader'

interface PlaceholderProps {
  title: string
  breadcrumbs?: { label: string; href?: string }[]
}

export function Placeholder({ title, breadcrumbs }: PlaceholderProps) {
  return (
    <div>
      <PageHeader title={title} breadcrumbs={breadcrumbs} />
      <div className="flex items-center justify-center rounded-lg border-2 border-dashed border-sand bg-parchment/50 p-16">
        <p className="font-body text-sm text-sand">
          {title} — coming soon
        </p>
      </div>
    </div>
  )
}
