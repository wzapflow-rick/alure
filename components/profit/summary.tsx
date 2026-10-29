import { Banknote, Megaphone, Receipt, ShoppingBag, TrendingUp, Truck, type LucideIcon } from 'lucide-react'
import type { ProfitReport } from '@/lib/profit/queries'
import { formatBRL, formatInt } from '@/lib/format'
import { cn } from '@/lib/utils'

const ratio = (value: number, base: number) => (base > 0 ? value / base : 0)
const pct = (value: number, base: number) =>
  base > 0 ? `${(ratio(value, base) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%` : '—'

type Tone = 'neutral' | 'cost' | 'ship' | 'ads' | 'gain' | 'loss'

const TONE: Record<Tone, { chip: string; bar: string; value: string }> = {
  neutral: { chip: 'bg-primary/10 text-primary', bar: 'bg-primary', value: 'text-foreground' },
  cost: { chip: 'bg-attention/10 text-attention', bar: 'bg-attention', value: 'text-foreground' },
  ship: { chip: 'bg-surface-2 text-muted-foreground', bar: 'bg-muted-foreground/60', value: 'text-foreground' },
  ads: { chip: 'bg-info/10 text-info', bar: 'bg-info', value: 'text-foreground' },
  gain: { chip: 'bg-positive/10 text-positive', bar: 'bg-positive', value: 'text-positive' },
  loss: { chip: 'bg-critical/10 text-critical', bar: 'bg-critical', value: 'text-critical' },
}

function Card({
  icon: Icon,
  label,
  value,
  share,
  tone,
  details,
  note,
  featured,
}: {
  icon: LucideIcon
  label: string
  value: string
  share?: { text: string; ratio: number }
  tone: Tone
  details?: { label: string; value: string }[]
  note?: React.ReactNode
  featured?: boolean
}) {
  const t = TONE[tone]
  return (
    <article
      className={cn(
        'flex min-w-0 flex-col gap-4 rounded-xl border border-border bg-surface p-4 shadow-[0_1px_2px_rgb(6_22_40/0.05)] sm:p-5',
        featured && 'sm:col-span-2 xl:col-span-1',
      )}
    >
      <header className="flex items-center gap-2.5">
        <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-lg', t.chip)}>
          <Icon className="size-4" aria-hidden />
        </span>
        <h3 className="text-sm font-medium text-muted-foreground">{label}</h3>
      </header>

      <div className="flex flex-col gap-2">
        <p className="flex flex-wrap items-baseline gap-x-2">
          <span className={cn('text-[26px] font-semibold leading-none tracking-tight tabular', t.value)}>{value}</span>
          {share ? <span className="text-xs text-muted-foreground tabular">{share.text} das vendas</span> : null}
        </p>
        {share ? (
          <div className="h-1 w-full overflow-hidden rounded-full bg-surface-2" aria-hidden>
            <span
              className={cn('block h-full rounded-full', t.bar)}
              style={{ width: `${Math.min(100, Math.abs(share.ratio) * 100)}%` }}
            />
          </div>
        ) : null}
      </div>

      {details?.length ? (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-border pt-3 sm:grid-cols-3">
          {details.map((d) => (
            <div key={d.label} className="flex min-w-0 flex-col gap-0.5">
              <dt className="truncate text-xs text-muted-foreground">{d.label}</dt>
              <dd className="truncate text-sm font-medium tabular">{d.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {note ? <p className="mt-auto text-xs leading-relaxed text-muted-foreground text-pretty">{note}</p> : null}
    </article>
  )
}

/** Where each real of sales went: the one visual that explains the margin at a glance. */
function SplitBar({ s }: { s: ProfitReport['summary'] }) {
  if (s.sales <= 0) return null
  const ads = s.adsApplies ? s.ads : 0
  const profit = s.contribution - ads
  const parts = [
    { label: 'Custo do produto', value: s.cost, className: 'bg-foreground/70' },
    { label: 'Tarifas e impostos', value: s.fees + s.taxes, className: 'bg-attention' },
    { label: 'Frete', value: s.sellerShip, className: 'bg-muted-foreground/50' },
    { label: 'Publicidade', value: ads, className: 'bg-info' },
    {
      label: profit >= 0 ? 'Lucro' : 'Prejuízo',
      value: Math.abs(profit),
      className: profit >= 0 ? 'bg-positive' : 'bg-critical',
    },
  ].filter((p) => p.value > 0)
  const total = parts.reduce((sum, p) => sum + p.value, 0)

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-4 shadow-[0_1px_2px_rgb(6_22_40/0.05)] sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">Para onde foi cada R$ 100 vendidos</h3>
        <span className="text-xs text-muted-foreground tabular">
          {formatInt(s.orders)} pedidos, {formatInt(s.units)} unidades
        </span>
      </div>
      <div className="flex h-4 w-full gap-0.5 overflow-hidden rounded-md" role="img" aria-label="Divisão das vendas">
        {parts.map((p) => (
          <span key={p.label} className={cn('h-full first:rounded-l-md last:rounded-r-md', p.className)} style={{ width: `${(p.value / total) * 100}%` }} />
        ))}
      </div>
      <ul className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 lg:grid-cols-5">
        {parts.map((p) => (
          <li key={p.label} className="flex min-w-0 flex-col gap-1">
            <span className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className={cn('size-2 shrink-0 rounded-sm', p.className)} aria-hidden />
              <span className="truncate">{p.label}</span>
            </span>
            <span className="pl-4 text-sm font-semibold tabular">{formatBRL((p.value / s.sales) * 100)}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

export function ProfitSummary({ report }: { report: ProfitReport }) {
  const s = report.summary
  const costsTotal = s.cost + s.fees + s.taxes
  const share = (v: number) => ({ text: pct(v, s.sales), ratio: ratio(v, s.sales) })

  return (
    <div className="flex flex-col gap-4">
      <SplitBar s={s} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Card
          icon={ShoppingBag}
          label="Vendas válidas"
          value={formatBRL(s.sales)}
          tone="neutral"
          featured
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
          share={share(costsTotal)}
          tone="cost"
          details={[
            { label: 'Custo produto', value: formatBRL(s.cost) },
            { label: 'Tarifas ML', value: formatBRL(s.fees) },
            { label: `Impostos${report.taxRatePct ? ` (${report.taxRatePct}%)` : ''}`, value: formatBRL(s.taxes) },
          ]}
          note={
            s.itemsWithoutCost
              ? `${s.itemsWithoutCost} ${s.itemsWithoutCost === 1 ? 'item vendido está' : 'itens vendidos estão'} sem custo cadastrado, então a margem aparece maior do que a real.`
              : undefined
          }
        />
        <Card
          icon={Truck}
          label="Frete pago"
          value={formatBRL(s.sellerShip)}
          share={share(s.sellerShip)}
          tone="ship"
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
          share={share(s.contribution)}
          tone={s.contribution < 0 ? 'loss' : 'gain'}
          note="Vendas menos custo, tarifas, impostos e frete."
        />
        <Card
          icon={Megaphone}
          label="Publicidade"
          value={s.adsApplies ? formatBRL(s.ads) : '—'}
          share={s.adsApplies ? share(s.ads) : undefined}
          tone="ads"
          note={
            !s.adsApplies
              ? 'Ads não são separáveis por produto. Limpe a busca para ver o total.'
              : s.adsDays
                ? `${s.adsDays} ${s.adsDays === 1 ? 'dia lançado' : 'dias lançados'} no período.`
                : 'Nenhum investimento lançado no período.'
          }
        />
        <Card
          icon={TrendingUp}
          label="Margem após Ads"
          value={s.adsApplies ? formatBRL(s.afterAds) : '—'}
          share={s.adsApplies ? share(s.afterAds) : undefined}
          tone={!s.adsApplies ? 'ship' : s.afterAds < 0 ? 'loss' : 'gain'}
          note={s.adsApplies && s.afterAds < 0 ? 'O período deu prejuízo depois da publicidade.' : undefined}
        />
      </div>
    </div>
  )
}
