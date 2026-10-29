import { Sparkles } from 'lucide-react'
import { Disclosure } from '@/components/ui/primitives'
import { DailyBriefPanel } from '@/components/command/daily-brief'
import { AIReadingPanel } from '@/components/command/ai-reading'
import type { AnalysisRun } from '@/lib/analysis'
import type { DailyBrief } from '@/lib/queries'

const MAX_SUPPORT_SENTENCES = 2

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/**
 * Metric deltas ("R$ 349,70 → R$ 484,74") already live in the KPI strip, so the
 * reading keeps only the narrative. Splitting requires whitespace + uppercase after
 * the punctuation so "R$ 1.234,00" is never treated as a sentence end.
 */
function stripNumericParentheticals(text: string) {
  let out = text
  let prev = ''
  while (out !== prev) {
    prev = out
    out = out.replace(/\s*\([^()]*\d[^()]*\)/g, '')
  }
  return out
}

function readingParts(text: string | null) {
  if (!text) return null
  const clean = stripNumericParentheticals(text.replace(/\s+/g, ' ')).trim()

  const sentences = clean
    .split(/(?<=[.!?])\s+(?=[A-ZÀ-Ý])/)
    .map((s) =>
      s
        .split(';')
        .filter((clause) => !clause.includes('→'))
        .join(';')
        .replace(/^[\s()):;,.]+/, '')
        .replace(/[\s();:,]+$/, '')
        .replace(/\s+([.,;])/g, '$1')
        .trim(),
    )
    .filter((s) => /[a-zà-ú]{3}/i.test(s) && !s.includes('→'))
    .map((s) => capitalize(/[.!?]$/.test(s) ? s : `${s}.`))

  if (sentences.length === 0) return null
  return { headline: sentences[0], support: sentences.slice(1, 1 + MAX_SUPPORT_SENTENCES) }
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
  const reading = readingParts(ai?.summary ?? brief?.summary ?? brief?.lines?.[0]?.text ?? null)

  return (
    <section aria-label="Leitura do dia" className="flex gap-4 rounded-2xl border border-border bg-surface p-5 md:gap-5 md:p-6">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary" aria-hidden>
        <Sparkles className="size-4" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <h2 className="text-sm font-semibold">Leitura do dia</h2>
        {reading ? (
          <div className="flex max-w-2xl flex-col gap-2">
            <p className="text-base font-medium leading-relaxed text-foreground text-pretty md:text-lg">{reading.headline}</p>
            {reading.support.length > 0 ? (
              <p className="text-sm leading-relaxed text-muted-foreground text-pretty">{reading.support.join(' ')}</p>
            ) : null}
          </div>
        ) : (
          <p className="text-sm leading-relaxed text-muted-foreground" aria-live="polite">
            {analyzing
              ? 'A análise do dia está rodando. Recarregue em alguns segundos.'
              : 'A leitura de hoje ainda não foi gerada. Use "Atualizar" para gerar agora.'}
          </p>
        )}

        {brief ? (
          <Disclosure summary="Ver análise completa" bodyClassName="flex flex-col gap-4">
            <DailyBriefPanel brief={brief} latest={latest} analyzing={analyzing} />
            <AIReadingPanel block={brief.ai} />
          </Disclosure>
        ) : null}
      </div>
    </section>
  )
}
