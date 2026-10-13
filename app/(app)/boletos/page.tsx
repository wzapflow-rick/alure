import type { Metadata } from 'next'
import { Search } from 'lucide-react'
import { Input, PageHeader, Panel, Stat } from '@/components/ui/primitives'
import { Chips } from '@/components/ui/tab-nav'
import { BillForm } from '@/components/bills/bill-form'
import { BillList, DebtsList } from '@/components/bills/bill-list'
import { BILL_FILTERS, isBillFilter, type BillFilter } from '@/lib/bills/constants'
import { getBillSummary, isBillsTableReady, listBills, listDebtsByBeneficiary } from '@/lib/bills/queries'
import { formatBRL, todayISO } from '@/lib/format'

export const metadata: Metadata = { title: 'Boletos' }

const EMPTY_TITLE: Record<BillFilter, string> = {
  aberto: 'Nenhum boleto a pagar.',
  vencidos: 'Nenhum boleto vencido.',
  semana: 'Nada vence nos próximos 7 dias.',
  pagos: 'Nenhum boleto pago ainda.',
  cancelados: 'Nenhum boleto cancelado.',
  todos: 'Nenhum boleto cadastrado.',
}

export default async function BillsPage({ searchParams }: { searchParams: Promise<{ filtro?: string; q?: string }> }) {
  const sp = await searchParams
  const filter: BillFilter = isBillFilter(sp.filtro) ? sp.filtro : 'aberto'
  const q = sp.q?.trim().slice(0, 100) || undefined
  const today = todayISO()

  if (!(await isBillsTableReady())) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader eyebrow="Financeiro" title="Boletos" />
        <Panel title="Falta preparar o banco">
          <p className="px-4 py-5 text-sm leading-relaxed text-muted-foreground sm:px-5">
            Rode a migração <code className="font-mono text-foreground">db/023_boletos.sql</code> no pgAdmin e recarregue a página.
          </p>
        </Panel>
      </div>
    )
  }

  const [summary, bills, debts] = await Promise.all([getBillSummary(today), listBills(filter, today, q), listDebtsByBeneficiary(today)])
  const listedTotal = bills.reduce((sum, b) => sum + Number(b.status === 'paid' ? b.paid_amount ?? b.amount : b.amount), 0)
  const counts: Partial<Record<BillFilter, number>> = {
    aberto: summary.open_count,
    vencidos: summary.overdue_count,
    semana: summary.week_count,
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Financeiro"
        title="Boletos"
        description="Todas as contas a pagar num lugar só: envie o arquivo ou cole a linha digitável, acompanhe vencimentos e veja quanto se deve a cada credor."
      />

      <Panel>
        <div className="grid grid-cols-2 gap-x-6 gap-y-5 px-4 py-5 sm:px-5 lg:grid-cols-4">
          <Stat label="Em aberto" value={formatBRL(summary.open_total)} hint={`${summary.open_count} boletos · ${formatBRL(summary.month_open_total)} neste mês`} />
          <Stat
            label="Vencidos"
            value={formatBRL(summary.overdue_total)}
            hint={`${summary.overdue_count} boletos`}
            tone={summary.overdue_count ? 'critical' : undefined}
          />
          <Stat
            label="Próximos 7 dias"
            value={formatBRL(summary.week_total)}
            hint={`${summary.week_count} boletos`}
            tone={summary.week_count ? 'attention' : undefined}
          />
          <Stat label="Pago este mês" value={formatBRL(summary.paid_month_total)} hint={`${summary.paid_month_count} boletos`} tone="positive" />
        </div>
      </Panel>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
        <Panel
          title="Contas"
          action={bills.length ? <span className="text-xs text-muted-foreground tabular">{bills.length} · {formatBRL(listedTotal)}</span> : null}
        >
          <div className="flex flex-col gap-3 border-b border-border px-4 py-3.5 sm:px-5">
            <Chips
              label="Filtro de boletos"
              items={BILL_FILTERS.map((f) => ({
                key: f.key,
                href: { pathname: '/boletos', query: { ...(q ? { q } : {}), ...(f.key !== 'aberto' ? { filtro: f.key } : {}) } },
                label: f.label,
                active: filter === f.key,
                count: counts[f.key],
              }))}
            />
            <form role="search" className="relative">
              {filter !== 'aberto' ? <input type="hidden" name="filtro" value={filter} /> : null}
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <label htmlFor="bill-search" className="sr-only">
                Buscar boletos
              </label>
              <Input id="bill-search" name="q" type="search" defaultValue={q} placeholder="Buscar por credor, descrição ou documento" className="pl-9" />
            </form>
          </div>
          <BillList bills={bills} today={today} emptyTitle={q ? `Nada encontrado para "${q}".` : EMPTY_TITLE[filter]} />
        </Panel>

        <div className="flex flex-col gap-6">
          <Panel title="Novo boleto">
            <div className="px-4 py-5 sm:px-5">
              <BillForm today={today} />
            </div>
          </Panel>
          <Panel title="Dívidas por credor">
            <DebtsList debts={debts} today={today} />
          </Panel>
        </div>
      </div>
    </div>
  )
}
