import { Disclosure } from '@/components/ui/primitives'
import { DailyBriefPanel } from '@/components/command/daily-brief'
import { AIReadingPanel } from '@/components/command/ai-reading'
import type { AnalysisRun } from '@/lib/analysis'
import type { DailyBrief } from '@/lib/queries'

const MAX_SENTENCES = 3

/** Whole sentences only — never cut mid-phrase. */
function shortReading(text: string | null) {
  if (!text) return null
  const clean = text.replace(/\s+/g, ' ').trim()
  const sentences = clean.match(/[^.!?]+[.!?]+(?=\s|$)/g) ?? [clean]
  const joined = sentences.slice(0, MAX_SENTENCES).join(' ').trim()
  return joined.charAt(0).toUpperCase() + joined.slice(1)
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
  const reading = shortReading(ai?.summary ?? brief?.summary ?? brief?.lines?.[0]?.text ?? null)

  return (
    <div className="flex flex-col gap-6">
      {reading ? (
        <p className="max-w-3xl text-xl leading-relaxed tracking-tight text-foreground text-pretty md:text-[26px] md:leading-[1.45]">{reading}</p>
      ) : (
        <p className="text-base leading-relaxed text-muted-foreground" aria-live="polite">
          {analyzing ? 'A análise do dia está rodando. Recarregue em alguns segundos.' : 'A leitura de hoje ainda não foi gerada.'}
        </p>
      )}

      {brief ? (
        <Disclosure summary="Ver análise completa" bodyClassName="flex flex-col gap-4">
          <DailyBriefPanel brief={brief} latest={latest} analyzing={analyzing} />
          <AIReadingPanel block={brief.ai} />
        </Disclosure>
      ) : null}
    </div>
  )
}
