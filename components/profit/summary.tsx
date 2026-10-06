import { Banknote, Megaphone, Receipt, ShoppingBag, TrendingUp, Truck, type LucideIcon } from 'lucide-react'
import type { ProfitReport } from '@/lib/profit/queries'
import { formatBRL, formatInt } from '@/lib/format'
import { cn } from '@/lib/utils'

const pct = (value: number, base: number) =>
  base > 0 ? `${((value / base) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%` : '—'

type Tone = 'neutral' | 'positive' | 'critical' | 'attention'

function Card({
  icon: Icon,
  label,
  value,
  share,
  tone = 'neutral',
  details,
  note,
}: {
  icon: LucideIcon
  label: string
  value: string
  share?: string
  tone?: Tone
  details?: { label: string; value: string }[]
  note?: React.ReactNode
}) {
  return (
    <article
      className={cn(
        'flex min-w-0 flex-col gap-3 rounded-xl border bg-surface p-4 sm:p-5',
        tone === 'positive' && 'border-positive/30',
        tone === 'critical' && 'border-critical/40 bg-critical/5',
        tone === 'neutral' && 'border-border',
        tone === 'attention' && 'border-border',
      )}
    >
      <header className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-medium text-muted-foreground">{label}</h3>
        <Icon className="size-4 text-muted-foreground" aria-hidden />
      </header>
      <p className="flex flex-wrap items-baseline gap-x-2">
        <span
          className={cn(
            'text-2xl font-semibold tracking-tight tabular',
            tone === 'positive' && 'text-positive',
            tone === 'critical' && 'text-critical',
          )}
        >
          {value}
        </span>
        {share ? <span className="text-xs text-muted-foreground tabular">{share} das vendas</span> : null}
      </p>
      {details?.length ? (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 border-t border-border pt-3 sm:grid-cols-3">
          {details.map((d) => (
            <div key={d.label} className="flex min-w-0 flex-col gap-0.5">
              <dt className="text-[11px] text-muted-foreground">{d.label}</dt>
              <dd className="truncate text-sm tabular">{d.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {note ? <p className="text-xs leading-relaxed text-muted-foreground">{note}</p> : null}
    </article>
  )
}

/** Where each real of sales went: the one visual that explains the margin at a glance. */
function SplitBar({ s }: { s: ProfitReport['summary'] }) {
  if (s.sales <= 0) return null
  const ads = s.adsApplies ? s.ads : 0
  const profit = s.contribution - ads
  const parts = [
    { label: 'Custo do produto', value: s.cost, className: 'bg-muted-foreground/50' },
    { label: 'Tarifas e impostos', value: s.fees + s.taxes, className: 'bg-attention' },
    { label: 'Frete', value: s.sellerShip, className: 'bg-primary' },
    { label: 'Publicidade', value: ads, className: 'bg-critical' },
    { label: profit >= 0 ? 'Lucro' : 'Prejuízo', value: Math.abs(profit), className: profit >= 0 ? 'bg-positive' : 'bg-critical/40' },
  ].filter((p) => p.value > 0)
  const total = parts.reduce((sum, p) => sum + p.value, 0)

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-medium">Para onde foi cada R$ 100 vendidos</h3>
        <span className="text-xs text-muted-foreground tabular">
          {formatInt(s.orders)} pedidos · {formatInt(s.units)} unidades
        </span>
      </div>
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-surface-2" role="img" aria-label="Divisão das vendas">
        {parts.map((p) => (
          <span key={p.label} className={p.className} style={{ width: `${(p.value / total) * 100}%` }} />
        ))}
      </div>
      <ul className="flex flex-wrap gap-x-5 gap-y-2">
        {parts.map((p) => (
          <li key={p.label} className="flex items-center gap-2 text-xs">
            <span className={cn('size-2.5 rounded-full', p.className)} aria-hidden />
            <span className="text-muted-foreground">{p.label}</span>
            <span className="tabular">{formatBRL((p.value / s.sales) * 100)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function ProfitSummary({ report }: { report: ProfitReport }) {
  const s = report.summary
  const costsTotal = s.cost + s.fees + s.taxes
  const afterAdsTone: Tone = !s.adsApplies ? 'neutral' : s.afterAds < 0 ? 'critical' : 'positive'

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Card
          icon={ShoppingBag}
          label="Vendas válidas"
          value={formatBRL(s.sales)}
          details={[
            { label: 'Total', value: formatBRL(s.gross) },
            { label: 'Cancelado', value: formatBRL(s.cancelled) },
            { label: 'Ticket médio', value: s.orders ? formatBRL(s.sales / s.orders) : '—' },
          ]}
        />
        <Card
          icon={Receipt}
          label="Tarifas e custos"
          value={formatBRL(costsTotal)}
          share={pct(costsTotal, s.sales)}
          details={[
            { label: 'Custo produto', value: formatBRL(s.cost) },
            { label: 'Tarifas ML', value: formatBRL(s.fees) },
            { label: `Impostos${report.taxRatePct ? ` (${report.taxRatePct}%)` : ''}`, value: formatBRL(s.taxes) },
          ]}
          note={
            s.itemsWithoutCost
              ? `${s.itemsWithoutCost} ${s.itemsWithoutCost === 1 ? 'item vendido está' : 'itens vendidos estão'} sem custo cadastrado — a margem fica maior do que a real.`
              : undefined
          }
        />
        <Card
          icon={Truck}
          label="Frete pago"
          value={formatBRL(s.sellerShip)}
          share={pct(s.sellerShip, s.sales)}
          details={[
            { label: 'Vendedor', value: formatBRL(s.sellerShip) },
            { label: 'Comprador', value: formatBRL(s.buyerShip) },
          ]}
          note={s.shippingPending ? `${s.shippingPending} pedidos com frete ainda não lido do ML.` : undefined}
        />
        <Card
          icon={Banknote}
          label="Margem de contribuição"
          value={formatBRL(s.contribution)}
          share={pct(s.contribution, s.sales)}
          tone={s.contribution < 0 ? 'critical' : 'neutral'}
          note="Vendas − custo − tarifas − impostos − frete."
        />
        <Card
          icon={Megaphone}
          label="Publicidade"
          value={s.adsApplies ? formatBRL(s.ads) : '—'}
          share={s.adsApplies ? pct(s.ads, s.sales) : undefined}
          note={
            !s.adsApplies
              ? 'Ads não são separáveis por produto; limpe a busca para ver o total.'
              : s.adsDays
                ? `${s.adsDays} ${s.adsDays === 1 ? 'dia lançado' : 'dias lançados'} no período.`
                : 'Nenhum investimento lançado no período.'
          }
        />
        <Card
          icon={TrendingUp}
          label="Margem após Ads"
          value={s.adsApplies ? formatBRL(s.afterAds) : '—'}
          share={s.adsApplies ? pct(s.afterAds, s.sales) : undefined}
          tone={afterAdsTone}
          note={s.adsApplies && s.afterAds < 0 ? 'O período deu prejuízo depois da publicidade.' : undefined}
        />
      </div>
      <SplitBar s={s} />
    </div>
  )
}
