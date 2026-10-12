import Link from 'next/link'
import { EmptyState, PageHeader } from '@/components/ui/primitives'
import { RecommendationCard } from '@/components/decisions/recommendation-card'
import { RunEngineButton } from '@/components/decisions/run-engine-button'
import { listRecommendations } from '@/lib/queries'
import { cn } from '@/lib/utils'

const TABS = [
  { key: 'open', label: 'Abertas', statuses: ['open'] },
  { key: 'approved', label: 'Em execução', statuses: ['approved', 'in_progress'] },
  { key: 'review', label: 'Em avaliação', statuses: ['awaiting_review'] },
  { key: 'completed', label: 'Concluídas', statuses: ['completed'] },
  { key: 'dismissed', label: 'Descartadas', statuses: ['dismissed', 'cancelled', 'rejected'] },
  { key: 'resolved', label: 'Resolvidas', statuses: ['resolved'] },
]

export async function RecommendationListPage({
  basePath,
  title,
  description,
  kinds,
  status,
  emptyText,
}: {
  basePath: string
  title: string
  description: string
  kinds: string[]
  status: string | undefined
  emptyText: string
}) {
  const tab = TABS.find((t) => t.key === status) ?? TABS[0]
  const recs = await listRecommendations({ kinds, statuses: tab.statuses, limit: 100 })

  return (
    <>
      <PageHeader title={title} description={description} action={<RunEngineButton />} />
      <nav aria-label="Filtro de status" className="-mx-4 flex gap-1 overflow-x-auto border-b border-border px-4 md:mx-0 md:px-0">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={t.key === 'open' ? basePath : `${basePath}?status=${t.key}`}
            aria-current={t.key === tab.key ? 'page' : undefined}
            className={cn(
              '-mb-px border-b-2 px-3 py-2 text-sm',
              t.key === tab.key ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      {recs.length ? (
        <div className="-mt-6 divide-y divide-border">
          {recs.map((r, i) => (
            <RecommendationCard key={r.id} rec={r} rank={tab.key === 'open' ? i + 1 : undefined} />
          ))}
        </div>
      ) : (
        <EmptyState title={emptyText} />
      )}
    </>
  )
}
