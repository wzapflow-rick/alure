import Link from 'next/link'
import { ArrowUpRight, Lightbulb } from 'lucide-react'
import { PanelCard } from '@/components/command/panel-card'
import type { RecommendationRow } from '@/lib/queries'

export function OpportunityStrip({ items, total }: { items: RecommendationRow[]; total: number }) {
  return (
    <PanelCard
      label="Oportunidades"
      icon={<Lightbulb className="size-4" />}
      count={total}
      tone={total ? 'primary' : 'neutral'}
      href={total ? '/oportunidades' : undefined}
    >
      {items.length ? (
        <ul className="flex flex-col divide-y divide-border">
          {items.map((r) => (
            <li key={r.id}>
              <Link
                href={r.product_id ? `/produtos/${r.product_id}#acoes` : '/oportunidades'}
                className="group flex items-start gap-3 py-3.5 first:pt-0 last:pb-0"
              >
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="text-sm font-medium leading-snug text-foreground text-pretty transition-colors group-hover:text-primary">
                    {r.title}
                  </span>
                  <span className="text-sm leading-relaxed text-muted-foreground text-pretty">{r.recommendation}</span>
                  {r.sku ? <span className="font-mono text-xs text-muted-foreground">{r.sku}</span> : null}
                </div>
                <ArrowUpRight className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm leading-relaxed text-muted-foreground">Nenhuma oportunidade além das prioridades.</p>
      )}
    </PanelCard>
  )
}
