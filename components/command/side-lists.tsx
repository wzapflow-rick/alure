import Link from 'next/link'
import { FlaskConical, Settings2 } from 'lucide-react'
import { Dot, VARIABLE_LABEL, type Tone } from '@/components/ui/badges'
import { PanelCard } from '@/components/command/panel-card'
import { daysBetween, formatDateTime, todayISO } from '@/lib/format'
import type { ExperimentRow } from '@/lib/queries'

export function TestsMini({ experiments }: { experiments: ExperimentRow[] }) {
  const today = todayISO()
  const ready = experiments.filter((e) => e.status === 'ready_for_review' || daysBetween(today, e.evaluation_date) <= 0)
  const running = experiments.length - ready.length

  return (
    <PanelCard
      label="Testes"
      icon={<FlaskConical className="size-4" />}
      count={ready.length}
      countSuffix="para avaliar"
      tone={ready.length ? 'primary' : 'neutral'}
      href="/testes"
      linkLabel="Ver todos"
    >
      {ready.length ? (
        <ul className="flex flex-col divide-y divide-border">
          {ready.slice(0, 3).map((e) => (
            <li key={e.id}>
              <Link
                href={`/testes/${e.id}`}
                className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-3 text-sm transition-colors first:pt-0 hover:text-primary"
              >
                <span className="font-mono text-[13px]">{e.sku}</span>
                <span className="text-muted-foreground">{VARIABLE_LABEL[e.variable] ?? e.variable}: avaliar resultado</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
      {running || !ready.length ? (
        <p className="text-sm leading-relaxed text-muted-foreground tabular">
          {running ? `${running} ${running === 1 ? 'teste rodando' : 'testes rodando'}.` : 'Nenhum teste em acompanhamento.'}
        </p>
      ) : null}
    </PanelCard>
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
    <section aria-label="Canais" className="flex flex-col gap-3">
      <header className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">Canais</h2>
        <Link
          href="/configuracoes"
          className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-primary"
        >
          <Settings2 className="size-3.5" aria-hidden />
          Conexões
        </Link>
      </header>
      {items.length ? (
        <ul className="flex flex-wrap gap-2">
          {items.map((c) => (
            <li
              key={c.id}
              className="flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 text-sm"
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
    </section>
  )
}
