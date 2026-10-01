import Link from 'next/link'
import { Dot } from '@/components/ui/badges'
import type { BriefItem, DailyBrief } from '@/lib/queries'
import type { AnalysisRun } from '@/lib/analysis'
import { formatDateTime } from '@/lib/format'

const SECTIONS: { key: 'positives' | 'risks' | 'opportunities' | 'actions' | 'tests'; label: string }[] = [
  { key: 'actions', label: 'Ações recomendadas' },
  { key: 'risks', label: 'Riscos' },
  { key: 'opportunities', label: 'Oportunidades' },
  { key: 'positives', label: 'O que foi bem' },
  { key: 'tests', label: 'Testes' },
]

function Item({ item }: { item: BriefItem }) {
  const body = <span className="text-pretty">{item.text}</span>
  return (
    <li className="flex items-baseline gap-2.5 text-sm leading-relaxed">
      <Dot tone={item.tone} />
      {item.href ? (
        <Link href={item.href} className="hover:underline">
          {body}
        </Link>
      ) : (
        body
      )}
    </li>
  )
}

export function DailyBriefPanel({
  brief,
  latest,
  analyzing,
}: {
  brief: DailyBrief | null
  latest: AnalysisRun | null
  analyzing: boolean
}) {
  const structured = brief?.summary !== undefined
  const sections = structured ? SECTIONS.filter((s) => (brief?.[s.key]?.length ?? 0) > 0) : []

  return (
    <section aria-label="Leitura de hoje" className="flex flex-col gap-4 rounded-lg border border-border bg-surface px-5 py-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Leitura de hoje</h2>
        <span className="font-mono text-[11px] text-muted-foreground" aria-live="polite">
          {analyzing
            ? 'Analisando os dados de hoje…'
            : latest?.finished_at
              ? `Análise ${formatDateTime(latest.finished_at)} · ${latest.channels_analyzed} canais`
              : 'Nenhuma análise registrada'}
        </span>
      </div>

      {!brief ? (
        <p className="text-sm leading-relaxed text-muted-foreground">
          {analyzing
            ? 'A primeira análise do dia está rodando. Recarregue em alguns segundos.'
            : 'A leitura de hoje ainda não foi gerada.'}
        </p>
      ) : structured ? (
        <>
          <p className="text-base leading-relaxed text-pretty">{brief.summary}</p>
          {sections.length ? (
            <div className="grid gap-x-8 gap-y-5 md:grid-cols-2">
              {sections.map((s) => (
                <div key={s.key} className="flex flex-col gap-2">
                  <h3 className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">{s.label}</h3>
                  <ul className="flex flex-col gap-1.5">
                    {brief[s.key]!.map((item, i) => (
                      <Item key={i} item={item} />
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ) : null}
        </>
      ) : (
        <ul className="flex flex-col gap-2">
          {brief.lines.map((l, i) => (
            <li key={i} className="flex items-baseline gap-3 text-sm leading-relaxed">
              <Dot tone={l.tone} />
              <span className="w-24 shrink-0 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">{l.label}</span>
              <span className="text-pretty">{l.text}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
