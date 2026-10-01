import type { Metadata } from 'next'
import { PageHeader } from '@/components/ui/primitives'
import { AssistantChat } from '@/components/assistant/assistant-chat'

export const metadata: Metadata = { title: 'Assistente' }

export default function AssistantPage() {
  return (
    <>
      <PageHeader
        title="Assistente"
        description="Explica os dados e as recomendações do motor. Não inventa números nem executa ações."
      />
      <div className="max-w-3xl">
        <AssistantChat />
      </div>
    </>
  )
}
