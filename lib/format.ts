export const TIMEZONE = 'America/Sao_Paulo'

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const int = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 })
const dec = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

export function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : null
}

export function formatBRL(value: unknown) {
  const n = toNumber(value)
  return n === null ? '—' : brl.format(n)
}

export function formatInt(value: unknown) {
  const n = toNumber(value)
  return n === null ? '—' : int.format(n)
}

export function formatPct(value: unknown, withSign = false) {
  const n = toNumber(value)
  if (n === null) return '—'
  const sign = withSign && n > 0 ? '+' : ''
  return `${sign}${dec.format(n)}%`
}

function toDate(value: string | Date) {
  if (value instanceof Date) return value
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date(`${value}T12:00:00Z`)
  return new Date(value)
}

export function formatDate(value: string | Date | null | undefined) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('pt-BR', { timeZone: TIMEZONE }).format(toDate(value))
}

export function formatDateTime(value: string | Date | null | undefined) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: TIMEZONE,
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(toDate(value))
}

export function formatLongToday() {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: TIMEZONE,
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date())
}

export function todayISO() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE }).format(new Date())
}

export function daysBetween(fromISO: string, toISO: string) {
  const a = toDate(fromISO).getTime()
  const b = toDate(toISO).getTime()
  return Math.round((b - a) / 86_400_000)
}

export function formatTestCode(id: number | string) {
  return `#${String(id).padStart(4, '0')}`
}
