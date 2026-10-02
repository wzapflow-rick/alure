import Link from 'next/link'
import { Disclosure, Section } from '@/components/ui/primitives'
import { DailyBriefPanel } from '@/components/command/daily-brief'
import { AIReadingPanel } from '@/components/command/ai-reading'
import type { AnalysisRun } from '@/lib/analysis'
import type { BriefItem, DailyBrief } from '@/lib/queries'
import { formatDateTime } from '@/lib/format'

type Line = { text: string; href?: string }

const toLines = (items: (BriefItem | string | null | undefined)[], max: number): Line[] =>
  items
    .filter((i): i is BriefItem | string => Boolean(i))
    .slice(0, max)
    .map((i) => (typeof i === 'string' ? { text: i } : { text: i.text, href: i.href }))

function Column({ label, lines }: { label: string; lines: Line[] }) {
  return (
    <div className="flex flex-col gap-2 border-t border-border pt-4">
      <h3 className="text-xs font-medium text-muted-foreground">{label}</h3>
      {lines.length ? (
        <ul className="flex flex-col gap-1.5">
          {lines.map((l, i) => (
            <li key={i} className="line-clamp-2 text-sm leading-relaxed text-pretty">
              {l.href ? (
                <Link href={l.href} className="underline-offset-4 transition-colors hover:text-primary hover:underline">
                  {l.text}
                </Link>
              ) : (
                l.text
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground/70">Sem sinal relevante.</p>
      )}
    </div>
  )
}

export function DayReading({
  brief,
  latest,
  analyzing,
}: {
  brief: DailyBrief | null
  latest: AnalysisRun | null
  analyzing: boolean
}) {
  const ai = brief?.ai?.status === 'ok' ? brief.ai.analysis : undefined
  const conclusion = ai?.summary ?? brief?.summary ?? brief?.lines?.[0]?.text ?? null

  const changed = toLines([...(brief?.positives ?? []).slice(0, 1), ...(brief?.risks ?? []).slice(0, 1), ...(ai?.what_changed ?? [])], 2)
  const why = toLines([ai?.main_bottleneck, ...(ai?.what_matters ?? []), ...(brief?.risks ?? []).slice(1)], 2)
  const todo = toLines([...(brief?.actions ?? []), ...(ai?.priorities ?? []).map((p) => p.action)], 2)

  const meta = analyzing
    ? 'Analisando…'
    : latest?.finished_at
      ? `Atualizada ${formatDateTime(latest.finished_at)}`
      : undefined

  return (
    <Section title="Leitura do dia" meta={<span aria-live="polite">{meta}</span>}>
      {conclusion ? (
        <p className="max-w-4xl text-xl leading-relaxed tracking-tight text-foreground text-pretty md:text-2xl md:leading-snug">
          {conclusion}
        </p>
      ) : (
        <p className="text-base leading-relaxed text-muted-foreground">
          {analyzing ? 'A primeira análise do dia está rodando. Recarregue em alguns segundos.' : 'A leitura de hoje ainda não foi gerada.'}
        </p>
      )}

      {brief ? (
        <>
          <div className="grid gap-6 md:grid-cols-3">
            <Column label="O que mudou" lines={changed} />
            <Column label="Por quê" lines={why} />
            <Column label="O que fazer" lines={todo} />
          </div>
          <Disclosure summary="Ver leitura completa" bodyClassName="flex flex-col gap-4">
            <DailyBriefPanel brief={brief} latest={latest} analyzing={analyzing} />
            <AIReadingPanel block={brief.ai} />
          </Disclosure>
        </>
      ) : null}
    </Section>
  )
}
