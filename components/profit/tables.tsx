import type { DayRow, ProductRow } from '@/lib/profit/queries'
import { formatBRL, formatInt } from '@/lib/format'
import { cn } from '@/lib/utils'

const marginPct = (row: { contribution: number; sales: number }) =>
  row.sales > 0 ? (row.contribution / row.sales) * 100 : 0

function Margin({ row }: { row: { contribution: number; sales: number } }) {
  const p = marginPct(row)
  return (
    <span className={cn('tabular', row.contribution < 0 ? 'text-critical' : p < 10 ? 'text-attention' : 'text-positive')}>
      {formatBRL(row.contribution)}
      <span className="ml-1 text-xs opacity-80">{p.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%</span>
    </span>
  )
}

const th = 'px-3 py-2.5 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground whitespace-nowrap'
const td = 'px-3 py-2.5 text-sm tabular whitespace-nowrap'

export function ProductTable({ rows }: { rows: ProductRow[] }) {
  return (
    <>
      <ul className="divide-y divide-border md:hidden">
        {rows.map((r) => (
          <li key={r.key} className="flex flex-col gap-2 px-4 py-3">
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="text-sm font-medium leading-snug text-pretty">{r.name}</span>
              <span className="font-mono text-xs text-muted-foreground">
                {r.sku ?? r.listingId} · {formatInt(r.units)} un.
              </span>
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              <dt className="text-muted-foreground">Vendas</dt>
              <dd className="text-right tabular">{formatBRL(r.sales)}</dd>
              <dt className="text-muted-foreground">Custo</dt>
              <dd className={cn('text-right tabular', r.missingCost && 'text-attention')}>
                {r.missingCost ? 'sem custo' : formatBRL(r.cost)}
              </dd>
              <dt className="text-muted-foreground">Tarifas + impostos</dt>
              <dd className="text-right tabular">{formatBRL(r.fees + r.taxes)}</dd>
              <dt className="text-muted-foreground">Frete</dt>
              <dd className="text-right tabular">{formatBRL(r.sellerShip)}</dd>
              <dt className="text-muted-foreground">Margem</dt>
              <dd className="text-right">
                <Margin row={r} />
              </dd>
            </dl>
          </li>
        ))}
      </ul>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full">
          <thead className="border-b border-border">
            <tr>
              <th className={th}>Produto</th>
              <th className={cn(th, 'text-right')}>Un.</th>
              <th className={cn(th, 'text-right')}>Vendas</th>
              <th className={cn(th, 'text-right')}>Custo</th>
              <th className={cn(th, 'text-right')}>Tarifas</th>
              <th className={cn(th, 'text-right')}>Impostos</th>
              <th className={cn(th, 'text-right')}>Frete</th>
              <th className={cn(th, 'text-right')}>Margem</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => (
              <tr key={r.key} className="hover:bg-surface-2/50">
                <td className="max-w-[320px] px-3 py-2.5">
                  <span className="block truncate text-sm" title={r.name}>
                    {r.name}
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">{r.sku ?? r.listingId}</span>
                </td>
                <td className={cn(td, 'text-right')}>{formatInt(r.units)}</td>
                <td className={cn(td, 'text-right')}>{formatBRL(r.sales)}</td>
                <td className={cn(td, 'text-right', r.missingCost && 'text-attention')}>
                  {r.missingCost ? 'sem custo' : formatBRL(r.cost)}
                </td>
                <td className={cn(td, 'text-right')}>{formatBRL(r.fees)}</td>
                <td className={cn(td, 'text-right')}>{formatBRL(r.taxes)}</td>
                <td className={cn(td, 'text-right')}>{formatBRL(r.sellerShip)}</td>
                <td className={cn(td, 'text-right')}>
                  <Margin row={r} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

const dayLabel = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('pt-BR', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    timeZone: 'UTC',
  })
}

export function DayTable({ rows }: { rows: DayRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead className="border-b border-border">
          <tr>
            <th className={th}>Dia</th>
            <th className={cn(th, 'text-right')}>Pedidos</th>
            <th className={cn(th, 'text-right')}>Vendas</th>
            <th className={cn(th, 'hidden text-right sm:table-cell')}>Custos + frete</th>
            <th className={cn(th, 'text-right')}>Margem</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r) => (
            <tr key={r.day}>
              <td className={cn(td, 'capitalize')}>{dayLabel(r.day)}</td>
              <td className={cn(td, 'text-right')}>{formatInt(r.orders)}</td>
              <td className={cn(td, 'text-right')}>{formatBRL(r.sales)}</td>
              <td className={cn(td, 'hidden text-right sm:table-cell')}>
                {formatBRL(r.cost + r.fees + r.taxes + r.sellerShip)}
              </td>
              <td className={cn(td, 'text-right')}>
                <Margin row={r} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
