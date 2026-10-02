import Link from 'next/link'
import { ArrowRight, Check, RotateCcw, X } from 'lucide-react'
import { ACTION_TYPE_LABEL, Badge, CONFIDENCE_LABEL, SEVERITY_LABEL, severityTone } from '@/components/ui/badges'
import { Disclosure } from '@/components/ui/primitives'
import { InlineAction } from '@/components/forms/action-form'
import { updateRecommendation } from '@/lib/actions/decisions'
import { formatTestCode } from '@/lib/format'
import type { RecommendationRow } from '@/lib/queries'
import { cn } from '@/lib/utils'

const EVIDENCE_TONE: Record<string, string> = {
  FATO: 'text-foreground',
  INTERPRETAÇÃO: 'text-foreground/80',
  HIPÓTESE: 'text-muted-foreground',
}

/**
 * Level 1: title + one sentence + impact + action.
 * Level 3 (evidence, data, motive, objective, confidence) stays collapsed under "Detalhes".
 */
export function RecommendationCard({
  rec,
  rank,
}: {
  rec: RecommendationRow
  rank?: number
  compact?: boolean
}) {
  const tone = severityTone(rec.severity)
  const data = rec.evidence_data ?? []
  const href = rec.product_id ? `/produtos/${rec.product_id}` : rec.experiment_id ? `/testes/${rec.experiment_id}` : null

  return (
    <article className="group flex gap-4 px-5 py-5 transition-colors duration-150 hover:bg-surface-2/40">
      {rank !== undefined ? (
        <span className="w-6 shrink-0 pt-0.5 font-mono text-xs text-muted-foreground/70 tabular" aria-hidden>
          {String(rank).padStart(2, '0')}
        </span>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-1">
            <h3 className="text-[15px] font-medium leading-snug text-pretty">
              {rec.sku ? <span className="mr-2 font-mono text-[13px] text-muted-foreground">{rec.sku}</span> : null}
              {href ? (
                <Link href={href} className="underline-offset-4 hover:underline">
                  {rec.title}
                </Link>
              ) : (
                rec.title
              )}
            </h3>
            <p className="line-clamp-2 text-sm leading-relaxed text-muted-foreground text-pretty">{rec.issue}</p>
          </div>
          <Badge tone={tone}>{SEVERITY_LABEL[rec.severity] ?? rec.severity}</Badge>
        </div>

        <p className="flex items-start gap-2 text-sm leading-relaxed text-foreground">
          <ArrowRight className="mt-1 size-3.5 shrink-0 text-primary" aria-hidden />
          <span className="text-pretty">{rec.recommendation}</span>
        </p>

        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <Disclosure summary="Detalhes" className="min-w-0 flex-1" bodyClassName="flex flex-col gap-4">
            {rec.evidence.length ? (
              <ul className="flex flex-col gap-1.5 border-l border-border pl-4">
                {rec.evidence.map((e, i) => (
                  <li key={i} className="flex flex-col gap-0.5 text-sm leading-relaxed sm:flex-row sm:gap-3">
                    <span className="w-24 shrink-0 pt-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{e.label}</span>
                    <span className={EVIDENCE_TONE[e.label]}>{e.text}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            {data.length ? (
              <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 lg:grid-cols-4">
                {data.map((d, i) => (
                  <div key={i} className="flex min-w-0 flex-col gap-0.5">
                    <dt className="truncate text-[11px] text-muted-foreground">{d.label}</dt>
                    <dd className="text-sm tabular">{d.value}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
            <dl className="grid gap-3 text-sm leading-relaxed md:grid-cols-2">
              <div className="flex flex-col gap-0.5">
                <dt className="text-xs text-muted-foreground">Motivo</dt>
                <dd>{rec.reason}</dd>
              </div>
              <div className="flex flex-col gap-0.5">
                <dt className="text-xs text-muted-foreground">Objetivo</dt>
                <dd>{rec.objective}</dd>
              </div>
            </dl>
            <p className="text-xs text-muted-foreground">
              {[ACTION_TYPE_LABEL[rec.action_type], CONFIDENCE_LABEL[rec.confidence], rec.experiment_id ? `Teste ${formatTestCode(rec.experiment_id)}` : null, rec.rule_code]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </Disclosure>

          <div className={cn('flex shrink-0 items-center gap-1 self-start')}>
            {rec.status === 'open' ? (
              <>
                <InlineAction
                  action={updateRecommendation}
                  fields={{ id: rec.id, status: 'dismissed' }}
                  label={
                    <>
                      <X className="size-3.5" aria-hidden /> Descartar
                    </>
                  }
                />
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
        </div>
      </div>
    </article>
  )
}
