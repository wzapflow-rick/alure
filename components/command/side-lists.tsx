import Link from 'next/link'
import { Dot, VARIABLE_LABEL, type Tone } from '@/components/ui/badges'
import { daysBetween, formatDateTime, todayISO } from '@/lib/format'
import type { ExperimentRow } from '@/lib/queries'

export function TestsMini({ experiments }: { experiments: ExperimentRow[] }) {
  const today = todayISO()
  const ready = experiments.filter((e) => e.status === 'ready_for_review' || daysBetween(today, e.evaluation_date) <= 0)
  const running = experiments.length - ready.length

  return (
    <section aria-label="Testes" className="flex flex-col gap-4">
      <header className="flex items-baseline justify-between gap-2">
        <h2 className="eyebrow tabular">
          Testes · <span className={ready.length ? 'text-primary' : undefined}>{ready.length}</span> para avaliar
        </h2>
        <Link href="/testes" className="text-xs text-muted-foreground transition-colors hover:text-foreground">
          Ver todos
        </Link>
      </header>
      {ready.length ? (
        <ul className="flex flex-col gap-3">
          {ready.slice(0, 3).map((e) => (
            <li key={e.id}>
              <Link href={`/testes/${e.id}`} className="flex items-baseline gap-4 text-sm transition-colors hover:text-primary">
                <span className="w-24 shrink-0 font-mono">{e.sku}</span>
                <span className="text-muted-foreground">{VARIABLE_LABEL[e.variable] ?? e.variable} · avaliar resultado</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
      <p className="text-sm text-muted-foreground tabular">
        {running ? `${running} ${running === 1 ? 'teste rodando' : 'testes rodando'}` : ready.length ? null : 'Nenhum teste em acompanhamento.'}
      </p>
    </section>
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
    <section aria-label="Canais" className="flex flex-col gap-4 md:flex-row md:items-baseline md:gap-10">
      <h2 className="eyebrow shrink-0">Canais</h2>
      {items.length ? (
        <ul className="flex flex-wrap gap-x-8 gap-y-2">
          {items.map((c) => (
            <li
              key={c.id}
              className="flex items-center gap-2 text-sm"
              title={[c.detail, c.lastSync ? `Sync ${formatDateTime(c.lastSync)}` : null].filter(Boolean).join(' · ') || undefined}
            >
              <Dot tone={c.tone} />
              <span className={c.tone === 'neutral' ? 'text-muted-foreground' : 'text-foreground'}>{c.name}</span>
              {c.tone !== 'neutral' ? <span className="text-xs text-muted-foreground">{c.label.toLowerCase()}</span> : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">Nenhum marketplace cadastrado.</p>
      )}
      <Link href="/configuracoes" className="text-xs text-muted-foreground transition-colors hover:text-foreground md:ml-auto">
        Conexões
      </Link>
    </section>
  )
}
