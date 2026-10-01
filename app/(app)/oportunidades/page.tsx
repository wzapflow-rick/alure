import type { Metadata } from 'next'
import { RecommendationListPage } from '@/components/decisions/recommendation-list-page'

export const metadata: Metadata = { title: 'Oportunidades' }

export default async function OpportunitiesPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams
  return (
    <RecommendationListPage
      basePath="/oportunidades"
      title="Oportunidades"
      description="Produtos ganhando tração. Proteger antes de ampliar."
      kinds={['opportunity']}
      status={status}
      emptyText="Nenhuma oportunidade neste filtro."
    />
  )
}
