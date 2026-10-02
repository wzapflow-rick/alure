import Link from 'next/link'
import { ArrowUpRight, Check, ChevronDown, RotateCcw, X } from 'lucide-react'
import { ACTION_TYPE_LABEL, CONFIDENCE_LABEL, SEVERITY_LABEL, severityTone } from '@/components/ui/badges'
import { Disclosure } from '@/components/ui/primitives'
import { InlineAction } from '@/components/forms/action-form'
import { updateRecommendation } from '@/lib/actions/decisions'
import { formatDateTime, formatTestCode } from '@/lib/format'
import type { RecommendationRow } from '@/lib/queries'
import { cn } from '@/lib/utils'

const KEY_FIGURES = [
  'Nosso preço',
  'Preço atual',
  'Concorrência',
  'Diferença',
  'Piso econômico',
  'Margem atual',
  'Margem de contribuição',
  'Economia',
  'Vendas (28d)',
  'Conversão atual',
  'Cobertura considerada',
  'Estoque atual',
  'Valor em teste',
]

const MAX_FIGURE_LENGTH = 16

const TONE_TEXT: Record<string, string> = {
  critical: 'text-critical',
  attention: 'text-attention',
  positive: 'text-positive',
  info: 'text-primary',
  neutral: 'text-muted-foreground',
}

const EVIDENCE_ORDER = ['FATO', 'INTERPRETAÇÃO', 'HIPÓTESE']

function keyFigures(rec: RecommendationRow) {
  const data = rec.evidence_data ?? []
  const picked: { label: string; value: string }[] = []
  for (const label of KEY_FIGURES) {
    const d = data.find((x) => x.label === label)
    if (d && String(d.value).length <= MAX_FIGURE_LENGTH) picked.push({ label: d.label, value: String(d.value) })
    if (picked.length === 2) break
  }
  return picked
}

/**
 * Layer 1: SKU, signal, key figures, conclusion and next action.
 * Layer 2 (on "Abrir"): evidence, data, motive, objective and the decision buttons.
 * Layer 3 (nested): technical metadata of the engine.
 */
export function RecommendationCard({ rec, rank }: { rec: RecommendationRow; rank?: number; compact?: boolean }) {
  const tone = severityTone(rec.severity)
  const data = rec.evidence_data ?? []
  const figures = keyFigures(rec)
  const href = rec.product_id ? `/produtos/${rec.product_id}` : rec.experiment_id ? `/testes/${rec.experiment_id}` : null
  const evidence = [...rec.evidence].sort((a, b) => EVIDENCE_ORDER.indexOf(a.label) - EVIDENCE_ORDER.indexOf(b.label))

  return (
    <article className="flex gap-5 py-7 md:gap-8">
      {rank !== undefined ? (
        <span className="w-6 shrink-0 pt-1 font-mono text-xs text-muted-foreground/60 tabular" aria-hidden>
          {String(rank).padStart(2, '0')}
        </span>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          {rec.sku ? <span className="font-mono text-base text-foreground">{rec.sku}</span> : null}
          <h3 className={cn('text-[11px] font-medium uppercase tracking-[0.14em]', TONE_TEXT[tone])}>
            {rec.title}
            <span className="sr-only"> · {SEVERITY_LABEL[rec.severity] ?? rec.severity}</span>
          </h3>
        </header>

        {figures.length ? (
          <dl className="flex flex-wrap gap-x-10 gap-y-3">
            {figures.map((f) => (
              <div key={f.label} className="flex flex-col gap-0.5">
                <dd className="order-1 text-2xl font-semibold tracking-tight tabular md:text-[28px]">{f.value}</dd>
                <dt className="order-2 text-xs text-muted-foreground">{f.label.toLowerCase()}</dt>
              </div>
            ))}
          </dl>
        ) : null}

        <p className="max-w-2xl text-[15px] leading-relaxed text-foreground/90 text-pretty">{rec.issue}</p>

        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Próxima ação</span>
          <p className="max-w-2xl text-[15px] leading-relaxed text-pretty">{rec.recommendation}</p>
        </div>

        <details className="group/open">
          <summary className="inline-flex cursor-pointer select-none items-center gap-1.5 rounded text-sm text-primary transition-colors hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50">
            <span className="group-open/open:hidden">Abrir</span>
            <span className="hidden group-open/open:inline">Fechar</span>
            <ChevronDown className="size-3.5 transition-transform duration-200 group-open/open:rotate-180" aria-hidden />
          </summary>

          <div className="mt-5 flex animate-fade flex-col gap-6 rounded-lg bg-surface px-5 py-5">
            {evidence.length ? (
              <dl className="flex flex-col gap-3">
                {evidence.map((e, i) => (
                  <div key={i} className="flex flex-col gap-0.5 sm:flex-row sm:gap-4">
                    <dt className="w-28 shrink-0 pt-0.5 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">{e.label}</dt>
                    <dd className={cn('text-sm leading-relaxed', e.label === 'HIPÓTESE' ? 'text-muted-foreground' : 'text-foreground')}>{e.text}</dd>
                  </div>
                ))}
                <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-4">
                  <dt className="w-28 shrink-0 pt-0.5 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">Ação</dt>
                  <dd className="text-sm font-medium leading-relaxed">{rec.recommendation}</dd>
                </div>
              </dl>
            ) : null}

            {data.length ? (
              <dl className="grid grid-cols-2 gap-x-6 gap-y-4 border-t border-border pt-5 sm:grid-cols-3">
                {data.map((d, i) => (
                  <div key={i} className="flex min-w-0 flex-col gap-0.5">
                    <dt className="text-[11px] text-muted-foreground">{d.label}</dt>
                    <dd className="text-sm tabular text-pretty">{d.value}</dd>
                  </div>
                ))}
              </dl>
            ) : null}

            <dl className="grid gap-4 border-t border-border pt-5 text-sm leading-relaxed md:grid-cols-2">
              <div className="flex flex-col gap-0.5">
                <dt className="text-xs text-muted-foreground">Motivo</dt>
                <dd className="text-pretty">{rec.reason}</dd>
              </div>
              <div className="flex flex-col gap-0.5">
                <dt className="text-xs text-muted-foreground">Objetivo</dt>
                <dd className="text-pretty">{rec.objective}</dd>
              </div>
            </dl>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
              <div className="flex items-center gap-1">
                {rec.status === 'open' ? (
                  <>
                    <InlineAction
                      action={updateRecommendation}
                      fields={{ id: rec.id, status: 'approved' }}
                      variant="secondary"
                      label={
                        <>
                          <Check className="size-3.5" aria-hidden /> {rec.action_type === 'approval_required' ? 'Aprovar' : 'Aceitar'}
                        </>
                      }
                    />
                    <InlineAction
                      action={updateRecommendation}
                      fields={{ id: rec.id, status: 'dismissed' }}
                      label={
                        <>
                          <X className="size-3.5" aria-hidden /> Descartar
                        </>
                      }
                    />
                  </>
                ) : (
                  <InlineAction
                    action={updateRecommendation}
                    fields={{ id: rec.id, status: 'open' }}
                    label={
                      <>
                        <RotateCcw className="size-3.5" aria-hidden /> Reabrir
                      </>
                    }
                  />
                )}
              </div>
              {href ? (
                <Link href={href} className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground">
                  {rec.product_id ? 'Abrir produto' : 'Abrir teste'} <ArrowUpRight className="size-3.5" aria-hidden />
                </Link>
              ) : null}
            </div>

            <Disclosure summary="Dados técnicos" bodyClassName="pt-3">
              <p className="font-mono text-[11px] leading-relaxed text-muted-foreground">
                {[
                  rec.rule_code,
                  ACTION_TYPE_LABEL[rec.action_type],
                  CONFIDENCE_LABEL[rec.confidence],
                  `score ${rec.priority_score}`,
                  rec.experiment_id ? `Teste ${formatTestCode(rec.experiment_id)}` : null,
                  `atualizado ${formatDateTime(rec.updated_at)}`,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </Disclosure>
          </div>
        </details>
      </div>
    </article>
  )
}
