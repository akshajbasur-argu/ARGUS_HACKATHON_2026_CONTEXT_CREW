import { useParams } from 'react-router-dom'
import { Placeholder } from '@/shared/components/Placeholder'

export function ChatbotIntake() {
  const { programmeId } = useParams()
  return (
    <Placeholder
      title="AI-Guided Application"
      breadcrumbs={[
        { label: 'Dashboard', href: '/dashboard' },
        { label: `Chat Intake — ${programmeId ?? '...'}` },
      ]}
    />
  )
}
