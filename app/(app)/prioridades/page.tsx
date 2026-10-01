import type { Metadata } from 'next'
import { RecommendationListPage } from '@/components/decisions/recommendation-list-page'

export const metadata: Metadata = { title: 'Prioridades' }

export default async function PrioritiesPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams
  return (
    <RecommendationListPage
      basePath="/prioridades"
      title="Prioridades"
      description="Problemas e decisões ordenados por impacto. Cada item separa fato, interpretação e hipótese."
      kinds={['priority', 'test_review', 'no_action']}
      status={status}
      emptyText="Nenhuma prioridade neste filtro."
    />
  )
}
