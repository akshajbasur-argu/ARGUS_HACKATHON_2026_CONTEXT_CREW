import { useParams } from 'react-router-dom'
import { Placeholder } from '@/shared/components/Placeholder'

export function ApplicationManagement() {
  const { id } = useParams()
  return (
    <Placeholder
      title="Application Management"
      breadcrumbs={[
        { label: 'Applications', href: '/staff/applications' },
        { label: id ?? '...' },
      ]}
    />
  )
}
