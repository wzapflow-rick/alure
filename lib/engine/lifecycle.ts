/**
 * Recommendation lifecycle: DETECTAR → PRIORIZAR → APROVAR → EXECUTAR → MEDIR → APRENDER.
 * 'open' and 'resolved' are owned by the engine; the rest are human decisions.
 * Pure module so the rules are unit-tested without a database.
 */

export type RecStatus =
  | 'open'
  | 'approved'
  | 'in_progress'
  | 'awaiting_review'
  | 'completed'
  | 'cancelled'
  | 'dismissed'
  | 'resolved'
  | 'rejected'

export type LifecycleStep = 'in_progress' | 'awaiting_review' | 'completed' | 'cancelled'

export const STATUS_LABEL: Record<RecStatus, string> = {
  open: 'Pendente',
  approved: 'Aprovada',
  in_progress: 'Em execução',
  awaiting_review: 'Aguardando avaliação',
  completed: 'Concluída',
  cancelled: 'Cancelada',
  dismissed: 'Descartada',
  resolved: 'Resolvida pelo motor',
  rejected: 'Rejeitada',
}

const TRANSITIONS: Record<string, LifecycleStep[]> = {
  approved: ['in_progress', 'awaiting_review', 'cancelled'],
  in_progress: ['awaiting_review', 'cancelled'],
  awaiting_review: ['completed'],
}

export function nextSteps(status: string): LifecycleStep[] {
  return TRANSITIONS[status] ?? []
}

export function canTransition(from: string, to: LifecycleStep) {
  return nextSteps(from).includes(to)
}

/** Only approved/dismissed/cancelled/resolved can go back to pending; executed work keeps its history. */
export function canReopen(status: string) {
  return ['approved', 'dismissed', 'cancelled', 'resolved', 'rejected'].includes(status)
}

export function addDaysISO(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** The evaluation window starts on the execution date, never on the approval date. */
export function reviewDateFor(executedAt: string, reviewDays: number) {
  return addDaysISO(executedAt, Math.max(3, reviewDays))
}

export type StepInput = {
  from: string
  to: LifecycleStep
  today: string
  approvedAt: string | null
  owner: string | null
  executedAt: string | null
  learning: string | null
  reviewDate: string | null
}

/** Returns an error message in Portuguese, or null when the step is allowed. */
export function validateStep(i: StepInput): string | null {
  if (!canTransition(i.from, i.to)) return `Não é possível passar de "${STATUS_LABEL[i.from as RecStatus] ?? i.from}" para "${STATUS_LABEL[i.to]}".`
  if ((i.to === 'in_progress' || i.to === 'awaiting_review') && !i.owner) return 'Informe o responsável pela execução.'
  if (i.to === 'awaiting_review') {
    if (!i.executedAt) return 'Informe a data em que a ação foi executada.'
    if (i.executedAt > i.today) return 'A data de execução não pode estar no futuro.'
    if (i.approvedAt && i.executedAt < i.approvedAt) return 'A execução não pode ser anterior à aprovação.'
  }
  if (i.to === 'completed') {
    if (!i.learning) return 'Registre o resultado observado e o aprendizado.'
    if (i.reviewDate && i.reviewDate > i.today) return `O período de avaliação termina em ${i.reviewDate.split('-').reverse().join('/')}. Conclua depois dessa data.`
  }
  return null
}
