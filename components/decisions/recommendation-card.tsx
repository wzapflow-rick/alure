import Link from 'next/link'
import { Check, RotateCcw, X } from 'lucide-react'
import {
  ACTION_TYPE_LABEL,
  Badge,
  CONFIDENCE_LABEL,
  Dot,
  SEVERITY_LABEL,
  severityTone,
} from '@/components/ui/badges'
import { InlineAction } from '@/components/forms/action-form'
import { updateRecommendation } from '@/lib/actions/decisions'
import { formatTestCode } from '@/lib/format'
import type { RecommendationRow } from '@/lib/queries'
import { cn } from '@/lib/utils'

const EVIDENCE_TONE: Record<string, string> = {
  FATO: 'text-foreground',
  INTERPRETAÇÃO: 'text-primary',
  HIPÓTESE: 'text-muted-foreground',
}

export function RecommendationCard({
  rec,
  rank,
  compact = false,
}: {
  rec: RecommendationRow
  rank?: number
  compact?: boolean
}) {
  const tone = severityTone(rec.severity)
  const evidence = compact ? rec.evidence.slice(0, 2) : rec.evidence
  const allData = rec.evidence_data ?? []
  const data = compact ? allData.slice(0, 4) : allData

  return (
    <article className="flex flex-col gap-4 px-5 py-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 gap-4">
          {rank !== undefined ? (
            <span className="font-mono text-xs text-muted-foreground tabular" aria-hidden>
              {String(rank).padStart(2, '0')}
            </span>
          ) : null}
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <Dot tone={tone} />
              <h3 className="text-sm font-medium text-pretty">
                {rec.product_id ? (
                  <Link href={`/produtos/${rec.product_id}`} className="hover:underline">
                    {rec.title}
                  </Link>
                ) : rec.experiment_id ? (
                  <Link href={`/testes/${rec.experiment_id}`} className="hover:underline">
                    {rec.title}
                  </Link>
                ) : (
                  rec.title
                )}
              </h3>
              {rec.sku ? <span className="font-mono text-[11px] text-muted-foreground">{rec.sku}</span> : null}
            </div>
            <p className="text-sm leading-relaxed text-foreground/90">{rec.issue}</p>
          </div>
        </div>
        <div className="hidden shrink-0 flex-wrap justify-end gap-1.5 sm:flex">
          <Badge tone={tone}>{SEVERITY_LABEL[rec.severity] ?? rec.severity}</Badge>
          <Badge>{ACTION_TYPE_LABEL[rec.action_type]}</Badge>
        </div>
      </div>

      <ul className={cn('flex flex-col gap-1.5 border-l border-border pl-4', rank !== undefined && 'ml-8')}>
        {evidence.map((e, i) => (
          <li key={i} className="flex gap-3 text-sm leading-relaxed">
            <span className="w-24 shrink-0 font-mono text-[10px] uppercase tracking-wider text-muted-foreground pt-1">{e.label}</span>
            <span className={EVIDENCE_TONE[e.label]}>{e.text}</span>
          </li>
        ))}
      </ul>

      {data.length ? (
        <dl className={cn('grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3 lg:grid-cols-4', rank !== undefined && 'ml-8')}>
          {data.map((d, i) => (
            <div key={i} className="flex min-w-0 flex-col gap-0.5">
              <dt className="truncate text-[11px] text-muted-foreground">{d.label}</dt>
              <dd className="font-mono text-xs tabular">{d.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      <div className={cn('flex flex-col gap-3 rounded-md bg-surface-2 px-4 py-3', rank !== undefined && 'ml-8')}>
        <div className="flex flex-col gap-0.5">
          <span className="font-mono text-[10px] uppercase tracking-wider text-primary">Ação recomendada</span>
          <p className="text-sm leading-relaxed">{rec.recommendation}</p>
        </div>
        {!compact ? (
          <dl className="grid gap-2 text-sm leading-relaxed md:grid-cols-2">
            <div>
              <dt className="text-xs text-muted-foreground">Motivo</dt>
              <dd>{rec.reason}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Objetivo</dt>
              <dd>{rec.objective}</dd>
            </div>
          </dl>
        ) : null}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-mono text-[11px] text-muted-foreground">
            {CONFIDENCE_LABEL[rec.confidence]}
            {rec.experiment_id ? ` · Teste ${formatTestCode(rec.experiment_id)}` : ''}
          </span>
          {rec.status === 'open' ? (
            <div className="flex items-center gap-1">
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
            </div>
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
    </article>
  )
}
