import Link from 'next/link'
import { ChevronRight, Paperclip } from 'lucide-react'
import { Badge } from '@/components/ui/badges'
import { EmptyState } from '@/components/ui/primitives'
import { CATEGORY_LABEL, billState } from '@/lib/bills/constants'
import type { Bill, DebtByBeneficiary } from '@/lib/bills/queries'
import { formatBRL, formatDate } from '@/lib/format'

export function BillList({ bills, today, emptyTitle }: { bills: Bill[]; today: string; emptyTitle: string }) {
  if (!bills.length) return <EmptyState title={emptyTitle} description="Envie um boleto pelo formulário ao lado para começar." />

  return (
    <ul className="divide-y divide-border">
      {bills.map((bill) => {
        const state = billState(bill, today)
        const meta = [
          CATEGORY_LABEL[bill.category] ?? bill.category,
          bill.is_recurring ? 'Recorrente' : null,
          bill.installment_number ? `Parcela ${bill.installment_number}${bill.installment_total ? `/${bill.installment_total}` : ''}` : null,
          bill.description,
        ].filter(Boolean)
        return (
          <li key={bill.id}>
            <Link
              href={`/boletos/${bill.id}`}
              className="group flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none sm:px-5"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium">{bill.beneficiary}</span>
                  {bill.file_pathname ? <Paperclip className="size-3.5 shrink-0 text-muted-foreground" aria-label="Com arquivo" /> : null}
                </div>
                <span className="truncate text-xs text-muted-foreground">{meta.join(' · ')}</span>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span className="text-sm font-medium tabular">{formatBRL(bill.status === 'paid' ? bill.paid_amount ?? bill.amount : bill.amount)}</span>
                <span className="flex items-center gap-2">
                  {bill.status === 'open' ? <span className="hidden text-xs text-muted-foreground tabular sm:inline">{formatDate(bill.due_date)}</span> : null}
                  <Badge tone={state.tone}>{state.label}</Badge>
                </span>
              </div>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5" aria-hidden />
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

export function DebtsList({ debts, today }: { debts: DebtByBeneficiary[]; today: string }) {
  if (!debts.length) return <EmptyState title="Nenhuma dívida em aberto." />
  const total = debts.reduce((sum, d) => sum + Number(d.open_total), 0)

  return (
    <ul className="flex flex-col gap-3 px-4 py-4 sm:px-5">
      {debts.map((debt) => {
        const share = total > 0 ? (Number(debt.open_total) / total) * 100 : 0
        return (
          <li key={debt.beneficiary} className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-3">
              <Link href={{ pathname: '/boletos', query: { filtro: 'aberto', q: debt.beneficiary } }} className="truncate text-sm hover:underline">
                {debt.beneficiary}
              </Link>
              <span className="shrink-0 text-sm font-medium tabular">{formatBRL(debt.open_total)}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
              <div className={debt.overdue_count ? 'h-full bg-critical' : 'h-full bg-primary'} style={{ width: `${Math.max(share, 2)}%` }} />
            </div>
            <span className="text-xs text-muted-foreground tabular">
              {debt.open_count} {debt.open_count === 1 ? 'boleto' : 'boletos'}
              {debt.overdue_count ? <span className="text-critical"> · {debt.overdue_count} vencido{debt.overdue_count > 1 ? 's' : ''}</span> : null}
              {' · próximo '}
              {debt.next_due < today ? 'já venceu' : formatDate(debt.next_due)}
            </span>
          </li>
        )
      })}
    </ul>
  )
}
