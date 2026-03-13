import { useParams } from 'react-router-dom'
import { Placeholder } from '@/shared/components/Placeholder'

export function ApplicationWizard() {
  const { programmeId } = useParams()
  return (
    <Placeholder
      title="Application Form"
      breadcrumbs={[
        { label: 'Dashboard', href: '/dashboard' },
        { label: `Apply — ${programmeId ?? '...'}` },
      ]}
    />
  )
}
