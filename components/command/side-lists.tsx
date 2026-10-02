import Link from 'next/link'
import { Badge, Dot, EXPERIMENT_STATUS_LABEL, VARIABLE_LABEL, experimentTone, type Tone } from '@/components/ui/badges'
import { daysBetween, formatDateTime, todayISO } from '@/lib/format'
import type { ExperimentRow } from '@/lib/queries'

function SideSection({ title, href, linkLabel, children }: { title: string; href: string; linkLabel: string; children: React.ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col gap-3">
      <header className="flex items-center justify-between gap-2">
        <h2 className="eyebrow">{title}</h2>
        <Link href={href} className="text-xs text-muted-foreground transition-colors hover:text-foreground">
          {linkLabel}
        </Link>
      </header>
      {children}
    </section>
  )
}

export function TestsMini({ experiments }: { experiments: ExperimentRow[] }) {
  const today = todayISO()
  return (
    <SideSection title="Testes" href="/testes" linkLabel="Ver todos">
      {experiments.length ? (
        <ul className="flex flex-col divide-y divide-border border-y border-border">
          {experiments.slice(0, 3).map((e) => {
            const left = daysBetween(today, e.evaluation_date)
            return (
              <li key={e.id}>
                <Link href={`/testes/${e.id}`} className="flex flex-col gap-1 py-3 transition-colors hover:text-primary">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm">
                      {VARIABLE_LABEL[e.variable] ?? e.variable} · {e.sku}
                    </span>
                    <Badge tone={experimentTone(e.status)}>{EXPERIMENT_STATUS_LABEL[e.status]}</Badge>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {left > 0 ? `${left} ${left === 1 ? 'dia' : 'dias'} restantes` : 'Pronto para avaliar'} · {e.primary_metric}
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">Nenhum teste em acompanhamento.</p>
      )}
    </SideSection>
  )
}

export type ChannelHealthItem = {
  id: string
  name: string
  tone: Tone
  label: string
  detail: string | null
  lastSync: string | null
}

export function ChannelHealth({ items }: { items: ChannelHealthItem[] }) {
  return (
    <SideSection title="Canais" href="/configuracoes" linkLabel="Conexões">
      {items.length ? (
        <ul className="flex flex-col divide-y divide-border border-y border-border">
          {items.map((c) => (
            <li key={c.id} className="flex flex-col gap-0.5 py-3" title={c.detail ?? undefined}>
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="flex items-center gap-2.5">
                  <Dot tone={c.tone} />
                  {c.name}
                </span>
                <span className="text-xs text-muted-foreground">{c.label}</span>
              </div>
              {c.lastSync ? <span className="pl-4 text-xs text-muted-foreground/70 tabular">Sync {formatDateTime(c.lastSync)}</span> : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">Nenhum marketplace cadastrado.</p>
      )}
    </SideSection>
  )
}
