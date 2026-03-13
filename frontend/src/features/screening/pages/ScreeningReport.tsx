import { useParams } from 'react-router-dom'
import { Placeholder } from '@/shared/components/Placeholder'

export function ScreeningReport() {
  const { id } = useParams()
  return (
    <Placeholder
      title="Screening Report"
      breadcrumbs={[
        { label: 'Applications', href: '/staff/applications' },
        { label: `Screening — ${id ?? '...'}` },
      ]}
    />
  )
}
