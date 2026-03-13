import { useParams } from 'react-router-dom'
import { Placeholder } from '@/shared/components/Placeholder'

export function ReviewWorkspace() {
  const { id } = useParams()
  return (
    <Placeholder
      title="Review Workspace"
      breadcrumbs={[
        { label: 'Review Queue', href: '/reviewer/queue' },
        { label: id ?? '...' },
      ]}
    />
  )
}
