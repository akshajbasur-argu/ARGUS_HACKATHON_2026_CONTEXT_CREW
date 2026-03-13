import { useParams } from 'react-router-dom'
import { Placeholder } from '@/shared/components/Placeholder'

export function ProgrammeDetailPage() {
  const { id } = useParams()
  return (
    <Placeholder
      title="Programme Details"
      breadcrumbs={[
        { label: 'Programmes', href: '/' },
        { label: id ?? '...' },
      ]}
    />
  )
}
