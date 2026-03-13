import { useParams } from 'react-router-dom'
import { Placeholder } from '@/shared/components/Placeholder'

export function ApplicationDetail() {
  const { id } = useParams()
  return (
    <Placeholder
      title="Application Detail"
      breadcrumbs={[
        { label: 'Dashboard', href: '/dashboard' },
        { label: id ?? '...' },
      ]}
    />
  )
}
