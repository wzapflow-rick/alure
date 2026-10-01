import type { DateRange } from '@/lib/integrations/types'

function isoInSaoPaulo(date: Date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(date)
}

/** Last `days` days including today, in São Paulo time. Re-syncing overlaps is safe (idempotent). */
export function syncRange(days: number): DateRange {
  const now = new Date()
  const from = new Date(now.getTime() - (days - 1) * 86_400_000)
  return { from: isoInSaoPaulo(from), to: isoInSaoPaulo(now) }
}
