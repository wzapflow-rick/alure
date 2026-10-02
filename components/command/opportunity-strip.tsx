import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
import type { RecommendationRow } from '@/lib/queries'

export function OpportunityStrip({ items, total }: { items: RecommendationRow[]; total: number }) {
  return (
    <section aria-label="Oportunidades" className="flex flex-col gap-4">
      <header className="flex items-baseline justify-between gap-2">
        <h2 className="eyebrow tabular">
          Oportunidades · <span className={total ? 'text-primary' : undefined}>{total}</span>
        </h2>
        {total ? (
          <Link href="/oportunidades" className="text-xs text-muted-foreground transition-colors hover:text-foreground">
            Ver todas
          </Link>
        ) : null}
      </header>

      {items.length ? (
        <ul className="flex flex-col divide-y divide-border">
          {items.map((r) => (
            <li key={r.id}>
              <Link
                href={r.product_id ? `/produtos/${r.product_id}#acoes` : '/oportunidades'}
                className="group flex items-baseline gap-4 py-3 first:pt-0"
              >
                <span className="w-24 shrink-0 font-mono text-sm">{r.sku ?? '—'}</span>
                <span className="min-w-0 flex-1 text-sm leading-relaxed text-pretty">
                  <span className="text-foreground">{r.title}</span>
                  <span className="text-muted-foreground"> · {r.recommendation}</span>
                </span>
                <ArrowUpRight className="size-3.5 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">Nenhuma oportunidade além das prioridades.</p>
      )}
    </section>
  )
}
