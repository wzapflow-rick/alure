import Link from 'next/link'
import { ArrowRight, ArrowUpRight, Check, ChevronDown, RotateCcw, X } from 'lucide-react'
import { ACTION_TYPE_LABEL, CONFIDENCE_LABEL, SEVERITY_LABEL, severityTone } from '@/components/ui/badges'
import { Disclosure } from '@/components/ui/primitives'
import { InlineAction } from '@/components/forms/action-form'
import { updateRecommendation } from '@/lib/actions/decisions'
import { ExecutionPanel } from '@/components/decisions/execution-panel'
import { canReopen } from '@/lib/engine/lifecycle'

const LIFECYCLE_VISIBLE = new Set(['approved', 'in_progress', 'awaiting_review', 'completed', 'cancelled'])
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

const TONE_PILL: Record<string, string> = {
  critical: 'bg-critical/10 text-critical',
  attention: 'bg-attention/10 text-attention',
  positive: 'bg-positive/10 text-positive',
  info: 'bg-primary/10 text-primary',
  neutral: 'bg-surface-2 text-muted-foreground',
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
    <article className="flex flex-col gap-4 py-6 md:py-7">
      <header className="flex flex-col gap-2.5">
        <div className="flex flex-wrap items-center gap-2">
          {rank !== undefined ? (
            <span
              className="flex size-6 items-center justify-center rounded-full bg-foreground text-[11px] font-semibold text-background tabular"
              aria-label={`Prioridade ${rank}`}
            >
              {rank}
            </span>
          ) : null}
          <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium', TONE_PILL[tone])}>
            <span className="size-1.5 rounded-full bg-current" aria-hidden />
            {SEVERITY_LABEL[rec.severity] ?? rec.severity}
          </span>
          {rec.sku ? (
            <span className="rounded-md bg-surface-2 px-1.5 py-0.5 font-mono text-xs text-muted-foreground">{rec.sku}</span>
          ) : null}
        </div>
        <h3 className="text-[15px] font-medium leading-snug text-foreground text-pretty md:text-base">{rec.title}</h3>
      </header>

      {figures.length ? (
        <dl className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:gap-x-10">
          {figures.map((f) => (
            <div key={f.label} className="flex min-w-0 flex-col gap-1">
              <dd className={cn('order-1 text-xl font-semibold tracking-tight tabular break-words md:text-2xl', f.value.trim().startsWith('-') && TONE_TEXT.critical)}>
                {f.value}
              </dd>
              <dt className="order-2 text-xs text-muted-foreground">{f.label}</dt>
            </div>
          ))}
        </dl>
      ) : null}

      <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground text-pretty">{rec.issue}</p>

      <div className="flex gap-3 rounded-xl bg-primary/5 px-4 py-3">
        <ArrowRight className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-xs font-medium text-primary">Próxima ação</span>
          <p className="text-sm leading-relaxed text-foreground text-pretty">{rec.recommendation}</p>
        </div>
      </div>

      <div className="flex min-w-0 flex-col">

        <details className="group/open">
          <summary className="inline-flex min-h-9 cursor-pointer select-none items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium text-foreground transition-colors hover:border-primary/40 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50">
            <span className="group-open/open:hidden">Ver detalhes</span>
            <span className="hidden group-open/open:inline">Fechar</span>
            <ChevronDown className="size-3.5 transition-transform duration-200 group-open/open:rotate-180" aria-hidden />
          </summary>

          <div className="mt-4 flex animate-fade flex-col gap-6 rounded-xl border border-border bg-background px-4 py-5 md:px-5">
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

            {LIFECYCLE_VISIBLE.has(rec.status) ? <ExecutionPanel rec={rec} /> : null}

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
                ) : canReopen(rec.status) ? (
                  <InlineAction
                    action={updateRecommendation}
                    fields={{ id: rec.id, status: 'open' }}
                    label={
                      <>
                        <RotateCcw className="size-3.5" aria-hidden /> Reabrir
                      </>
                    }
                  />
                ) : null}
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
