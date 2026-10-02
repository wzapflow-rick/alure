import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
import { Section } from '@/components/ui/primitives'
import type { RecommendationRow } from '@/lib/queries'

export function OpportunityStrip({ items, total }: { items: RecommendationRow[]; total: number }) {
  return (
    <Section
      title="Oportunidades"
      meta={total ? `${total} ${total === 1 ? 'encontrada' : 'encontradas'}` : undefined}
      action={
        total > items.length ? (
          <Link href="/oportunidades" className="text-xs text-muted-foreground transition-colors hover:text-foreground">
            Ver todas
          </Link>
        ) : null
      }
    >
      {items.length ? (
        <div className="grid gap-3 md:grid-cols-3">
          {items.map((r) => (
            <Link
              key={r.id}
              href={r.product_id ? `/produtos/${r.product_id}#acoes` : '/oportunidades'}
              className="group flex flex-col gap-3 rounded-xl border border-border bg-surface p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30"
            >
              <div className="flex flex-col gap-1">
                {r.sku ? <span className="font-mono text-xs text-muted-foreground">{r.sku}</span> : null}
                <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-primary">{r.title}</span>
              </div>
              <p className="line-clamp-2 text-sm leading-relaxed text-muted-foreground">{r.issue}</p>
              <p className="line-clamp-2 text-sm leading-relaxed text-foreground">{r.recommendation}</p>
              <span className="mt-auto inline-flex items-center gap-1 pt-1 text-xs text-muted-foreground transition-colors group-hover:text-foreground">
                Ver oportunidade <ArrowUpRight className="size-3" aria-hidden />
              </span>
            </Link>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Nenhuma oportunidade identificada.</p>
      )}
    </Section>
  )
}
