import type { Tone } from '@/components/ui/badges'

export const BILL_CATEGORIES = [
  { value: 'fornecedor', label: 'Fornecedor / mercadoria' },
  { value: 'imposto', label: 'Imposto / taxa' },
  { value: 'emprestimo', label: 'Empréstimo / financiamento' },
  { value: 'cartao', label: 'Cartão de crédito' },
  { value: 'aluguel', label: 'Aluguel' },
  { value: 'servicos', label: 'Serviços / sistemas' },
  { value: 'contas', label: 'Água, luz, internet' },
  { value: 'folha', label: 'Folha / pró-labore' },
  { value: 'outros', label: 'Outros' },
] as const

export type BillCategory = (typeof BILL_CATEGORIES)[number]['value']

export const CATEGORY_VALUES = BILL_CATEGORIES.map((c) => c.value) as [BillCategory, ...BillCategory[]]

export const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(BILL_CATEGORIES.map((c) => [c.value, c.label]))

export const BILL_FILTERS = [
  { key: 'aberto', label: 'A pagar' },
  { key: 'vencidos', label: 'Vencidos' },
  { key: 'semana', label: 'Próximos 7 dias' },
  { key: 'pagos', label: 'Pagos' },
  { key: 'cancelados', label: 'Cancelados' },
  { key: 'todos', label: 'Todos' },
] as const

export type BillFilter = (typeof BILL_FILTERS)[number]['key']

export function isBillFilter(value: unknown): value is BillFilter {
  return BILL_FILTERS.some((f) => f.key === value)
}

const DAY = 86_400_000

function dayDiff(fromISO: string, toISO: string) {
  return Math.round((Date.parse(`${toISO}T00:00:00Z`) - Date.parse(`${fromISO}T00:00:00Z`)) / DAY)
}

/** Human status of a bill relative to today: drives the badge text and color. */
export function billState(bill: { status: string; due_date: string; paid_at: string | null }, today: string): { label: string; tone: Tone } {
  if (bill.status === 'paid') {
    return { label: bill.paid_at ? `Pago em ${bill.paid_at.split('-').reverse().join('/')}` : 'Pago', tone: 'positive' }
  }
  if (bill.status === 'cancelled') return { label: 'Cancelado', tone: 'neutral' }
  const days = dayDiff(today, bill.due_date)
  if (days < 0) return { label: days === -1 ? 'Venceu ontem' : `Vencido há ${-days} dias`, tone: 'critical' }
  if (days === 0) return { label: 'Vence hoje', tone: 'critical' }
  if (days === 1) return { label: 'Vence amanhã', tone: 'attention' }
  if (days <= 7) return { label: `Vence em ${days} dias`, tone: 'attention' }
  return { label: `Vence em ${days} dias`, tone: 'neutral' }
}

/** Accepts "1.234,56", "1234,56" and "1234.56". */
export function parseMoneyInput(value: string) {
  const clean = value.replace(/[R$\s]/g, '')
  const normalized = clean.includes(',') ? clean.replace(/\./g, '').replace(',', '.') : clean
  const n = Number(normalized)
  return Number.isFinite(n) ? n : null
}

export function moneyToInput(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === '') return ''
  const n = Number(value)
  return Number.isFinite(n) ? n.toFixed(2).replace('.', ',') : ''
}

export function addMonthsISO(iso: string, months: number) {
  const [y, m, d] = iso.split('-').map(Number)
  const target = new Date(Date.UTC(y, m - 1 + months, 1))
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()
  target.setUTCDate(Math.min(d, lastDay))
  return target.toISOString().slice(0, 10)
}
