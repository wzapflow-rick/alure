import Link from 'next/link'
import { Dot, severityTone } from '@/components/ui/badges'

type AlertLite = { id: string; severity: string; message: string; product_id: string | null; experiment_id: string | null }

export function AttentionBox({ alerts }: { alerts: AlertLite[] }) {
  const critical = alerts.filter((a) => a.severity === 'critical')
  const attention = alerts.filter((a) => a.severity === 'attention')
  const info = alerts.length - critical.length - attention.length
  const top = [...critical, ...attention].slice(0, 3)

  return (
    <section aria-label="Alertas" className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-5">
      <header className="flex items-center justify-between gap-2">
        <h2 className="eyebrow">Atenção</h2>
        <Link href="/alertas" className="text-xs text-muted-foreground transition-colors hover:text-foreground">
          Alertas
        </Link>
      </header>

      <div className="flex items-center gap-5 text-sm tabular">
        <span className="flex items-center gap-2">
          <Dot tone="critical" /> {critical.length} <span className="text-muted-foreground">crítico{critical.length === 1 ? '' : 's'}</span>
        </span>
        <span className="flex items-center gap-2">
          <Dot tone="attention" /> {attention.length} <span className="text-muted-foreground">atenção</span>
        </span>
        {info > 0 ? (
          <span className="flex items-center gap-2 text-muted-foreground">
            <Dot tone="neutral" /> {info}
          </span>
        ) : null}
      </div>

      {top.length ? (
        <ul className="flex flex-col divide-y divide-border border-t border-border">
          {top.map((a) => {
            const href = a.product_id ? `/produtos/${a.product_id}` : a.experiment_id ? `/testes/${a.experiment_id}` : '/alertas'
            return (
              <li key={a.id}>
                <Link href={href} className="flex items-baseline gap-2.5 py-3 text-sm leading-relaxed transition-colors hover:text-primary">
                  <Dot tone={severityTone(a.severity)} />
                  <span className="line-clamp-2 text-pretty">{a.message}</span>
                </Link>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">Nada exige atenção agora.</p>
      )}
    </section>
  )
}
