import { cn } from '@/lib/utils'

export type Tone = 'critical' | 'attention' | 'positive' | 'info' | 'neutral'

const TONE: Record<Tone, string> = {
  critical: 'text-critical border-critical/30 bg-critical/10',
  attention: 'text-attention border-attention/30 bg-attention/10',
  positive: 'text-positive border-positive/30 bg-positive/10',
  info: 'text-info border-info/30 bg-info/10',
  neutral: 'text-muted-foreground border-border bg-surface-2',
}

const DOT: Record<Tone, string> = {
  critical: 'bg-critical',
  attention: 'bg-attention',
  positive: 'bg-positive',
  info: 'bg-info',
  neutral: 'bg-muted-foreground',
}

export function Badge({ tone = 'neutral', children, className }: { tone?: Tone; children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded border px-1.5 py-0.5 font-mono text-[11px] uppercase tracking-wider',
        TONE[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}

export function Dot({ tone }: { tone: Tone }) {
  return <span aria-hidden className={cn('inline-block size-1.5 shrink-0 rounded-full', DOT[tone])} />
}

export const SEVERITY_LABEL: Record<string, string> = {
  critical: 'Crítico',
  attention: 'Atenção',
  positive: 'Positivo',
  info: 'Info',
}

export function severityTone(severity: string): Tone {
  if (severity === 'critical' || severity === 'attention' || severity === 'positive' || severity === 'info') return severity
  return 'neutral'
}

export const ACTION_TYPE_LABEL: Record<string, string> = {
  information: 'Informação',
  recommendation: 'Recomendação',
  approval_required: 'Requer aprovação',
}

export const CONFIDENCE_LABEL: Record<string, string> = {
  low: 'Confiança baixa',
  medium: 'Confiança média',
  high: 'Confiança alta',
}

export const CLASSIFICATION_LABEL: Record<string, string> = {
  motor_de_giro: 'Motor de giro',
  produto_de_margem: 'Produto de margem',
  alto_ticket: 'Alto ticket',
  em_teste: 'Em teste',
  sazonal: 'Sazonal',
  observacao: 'Observação',
  sem_classificacao: 'Sem classificação',
}

export const EXPERIMENT_STATUS_LABEL: Record<string, string> = {
  planned: 'Planejado',
  in_progress: 'Em andamento',
  ready_for_review: 'Pronto para revisão',
  completed: 'Concluído',
  cancelled: 'Cancelado',
}

export function experimentTone(status: string): Tone {
  if (status === 'ready_for_review') return 'attention'
  if (status === 'in_progress') return 'info'
  if (status === 'completed') return 'positive'
  return 'neutral'
}

export const DECISION_LABEL: Record<string, string> = {
  keep: 'Manter',
  revert: 'Reverter',
  continue: 'Continuar',
  new_test: 'Novo teste',
}

export const VARIABLE_LABEL: Record<string, string> = {
  price: 'Preço',
  title: 'Título',
  images: 'Imagens',
  description: 'Descrição',
  promotion: 'Promoção',
  ads: 'Ads',
  shipping: 'Frete',
  other: 'Outro',
}
